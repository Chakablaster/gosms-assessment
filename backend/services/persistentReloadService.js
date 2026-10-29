
import { ReloadError } from './reloadService.js'

const BALANCES_KEY = 'gosms:v1:outlet-balances'

const ALLOCATE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {0, existing} end

for i = 2, #ARGV, 2 do
  local current = tonumber(redis.call('HGET', KEYS[2], ARGV[i]) or '0')
  local amount = tonumber(ARGV[i + 1])
  if not current or not amount or amount < 1 or current + amount > 9007199254740991 then
    return {-1, 'The resulting credit balance is too large.'}
  end
end

for i = 2, #ARGV, 2 do
  redis.call('HINCRBY', KEYS[2], ARGV[i], ARGV[i + 1])
end

redis.call('SET', KEYS[1], ARGV[1])
return {1, ARGV[1]}
`

function getSignature(brandId, creditsByOutlet) {
  const sortedCredits = creditsByOutlet && typeof creditsByOutlet === 'object' && !Array.isArray(creditsByOutlet)
    ? Object.entries(creditsByOutlet).sort(([left], [right]) => left.localeCompare(right))
    : creditsByOutlet

  return JSON.stringify({ brandId, creditsByOutlet: sortedCredits })
}

function parseRawBalances(raw) {
  if (!Array.isArray(raw) || raw.length % 2 !== 0) {
    throw new Error('Unexpected Redis balance response.')
  }

  const result = new Map()

  for (let index = 0; index < raw.length; index += 2) {
    const [outletId, value] = [raw[index], raw[index + 1]]

    if (
      typeof outletId !== 'string' ||
      typeof value !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(value) ||
      result.has(outletId)
    ) {
      throw new Error('Invalid stored SMS credit balance.')
    }

    result.set(outletId, BigInt(value))
  }

  return result
}

export function createPersistentReloadService({ redis, quotationService, validateAllocation, companies, outlets }) {
  async function getBalances() {
    const stored = parseRawBalances(await redis.hgetall(BALANCES_KEY))
    const companyBalances = Object.fromEntries(companies.map((company) => [company.id, '0']))
    const outletBalances = {}

    for (const outlet of outlets) {
      const credits = stored.get(outlet.id) ?? 0n

      outletBalances[outlet.id] = credits.toString()
      companyBalances[outlet.companyId] = (
        BigInt(companyBalances[outlet.companyId]) + credits
      ).toString()
    }

    return { companyBalances, outletBalances }
  }

  async function processReload({ operationId, brandId, creditsByOutlet } = {}) {
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(operationId)) {
      throw new ReloadError('Invalid top up operation identifier.')
    }

    const signature = getSignature(brandId, creditsByOutlet)
    const operationKey = `gosms:v1:operation:${operationId}`
    const existing = await redis.get(operationKey)

    if (existing !== null) {
      const record = JSON.parse(existing)

      if (record.signature !== signature) {
        throw new ReloadError('This top up operation has already been processed with different details.', 409)
      }

      return {
        quotation: record.quotation,
        allocation: { reference: record.quotation.reference, alreadyAllocated: true },
      }
    }

    const quotation = quotationService.generate({ brandId, creditsByOutlet })
    validateAllocation(quotation)

    const allocations = quotation.companies.flatMap((company) => company.outlets)
    const record = JSON.stringify({ signature, quotation })
    const result = await redis.eval(
      ALLOCATE_SCRIPT,
      [operationKey, BALANCES_KEY],
      [record, ...allocations.flatMap((item) => [item.outletId, item.credits])]
    )

    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Unexpected Redis allocation response.')
    }

    if (Number(result[0]) === -1) {
      throw new ReloadError(String(result[1]))
    }

    if (Number(result[0]) !== 0 && Number(result[0]) !== 1) {
      throw new Error('Invalid Redis allocation status.')
    }

    const saved = JSON.parse(result[1])

    if (saved.signature !== signature) {
      throw new ReloadError('This top up operation has already been processed with different details.', 409)
    }

    return {
      quotation: saved.quotation,
      allocation: {
        reference: saved.quotation.reference,
        alreadyAllocated: Number(result[0]) === 0,
      },
    }
  }

  return { getBalances, processReload }
}
