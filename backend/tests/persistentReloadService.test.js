
import { describe, expect, it } from 'vitest'
import { createPersistentReloadService } from '../services/persistentReloadService.js'

const companies = [{ id: 'company-a' }, { id: 'company-b' }]
const outlets = [
  { id: 'st-001', companyId: 'company-a' },
  { id: 'st-002', companyId: 'company-a' },
  { id: 'st-003', companyId: 'company-b' },
  { id: 'st-004', companyId: 'company-b' },
]

class FakeRedis {
  constructor() {
    this.operations = new Map()
    this.balances = new Map()
    this.overrideBalances = undefined
  }

  async get(key) {
    return this.operations.get(key) ?? null
  }

  async hgetall() {
    if (this.overrideBalances !== undefined) return this.overrideBalances
    return [...this.balances.entries()].flatMap(([outletId, credits]) => [outletId, credits])
  }

  async eval(_script, [operationKey], [record, ...allocations]) {
    const existing = this.operations.get(operationKey)
    if (existing) return [0, existing]

    for (let index = 0; index < allocations.length; index += 2) {
      const current = BigInt(this.balances.get(allocations[index]) ?? '0')
      const next = current + BigInt(allocations[index + 1])
      if (next > BigInt(Number.MAX_SAFE_INTEGER)) {
        return [-1, 'The resulting credit balance is too large.']
      }
    }

    for (let index = 0; index < allocations.length; index += 2) {
      const outletId = allocations[index]
      const next = BigInt(this.balances.get(outletId) ?? '0') + BigInt(allocations[index + 1])
      this.balances.set(outletId, next.toString())
    }

    this.operations.set(operationKey, record)
    return [1, record]
  }
}

function createService(redis) {
  let referenceNumber = 0

  const quotationService = {
    generate({ brandId, creditsByOutlet }) {
      const quotationCompanies = companies.map((company) => ({
        companyId: company.id,
        outlets: outlets
          .filter((outlet) => outlet.companyId === company.id && BigInt(creditsByOutlet[outlet.id] ?? '0') > 0n)
          .map((outlet) => ({ outletId: outlet.id, credits: creditsByOutlet[outlet.id] })),
      })).filter((company) => company.outlets.length > 0)

      return {
        reference: `QT-${++referenceNumber}`,
        brandId,
        companies: quotationCompanies,
      }
    },
  }

  return createPersistentReloadService({
    redis,
    quotationService,
    validateAllocation(quotation) {
      if (quotation.companies.length === 0) throw new Error('No credits to allocate.')
    },
    companies,
    outlets,
  })
}

const payload = {
  operationId: 'operation-1234',
  brandId: 'silvertree',
  creditsByOutlet: {
    'st-001': '303',
    'st-002': '300',
    'st-003': '300',
    'st-004': '0',
  },
}

describe('persistent Redis credit allocations', () => {
  it('returns zero balances for an empty database', async () => {
    const service = createService(new FakeRedis())
    const balances = await service.getBalances()

    expect(balances.outletBalances).toEqual({
      'st-001': '0', 'st-002': '0', 'st-003': '0', 'st-004': '0',
    })
  })

  it('retains 903 credits across separate service instances', async () => {
    const redis = new FakeRedis()
    const first = createService(redis)
    const result = await first.processReload(payload)

    expect(result.allocation.alreadyAllocated).toBe(false)

    const second = createService(redis)
    expect(await second.getBalances()).toEqual({
      companyBalances: { 'company-a': '603', 'company-b': '300' },
      outletBalances: { 'st-001': '303', 'st-002': '300', 'st-003': '300', 'st-004': '0' },
    })
  })

  it('does not allocate credits again when an operation is retried', async () => {
    const redis = new FakeRedis()
    const first = await createService(redis).processReload(payload)
    const retried = await createService(redis).processReload(payload)

    expect(retried.allocation.alreadyAllocated).toBe(true)
    expect(retried.quotation).toEqual(first.quotation)
    expect((await createService(redis).getBalances()).companyBalances['company-a']).toBe('603')
  })

  it('rejects an operation identifier reused with different amounts', async () => {
    const redis = new FakeRedis()
    await createService(redis).processReload(payload)

    await expect(createService(redis).processReload({
      ...payload,
      creditsByOutlet: { 'st-001': '2' },
    })).rejects.toMatchObject({ status: 409 })
  })

  it('adds further top ups to the saved balances', async () => {
    const redis = new FakeRedis()
    const service = createService(redis)
    await service.processReload(payload)
    await service.processReload({
      operationId: 'operation-5678',
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '2' },
    })

    expect((await createService(redis).getBalances()).outletBalances['st-001']).toBe('305')
  })

  it('rejects malformed Redis balance responses instead of showing zero', async () => {
    const redis = new FakeRedis()
    const service = createService(redis)

    redis.overrideBalances = { 'st-001': '303' }
    await expect(service.getBalances()).rejects.toThrow('Unexpected Redis balance response.')

    redis.overrideBalances = ['st-001', 'invalid']
    await expect(service.getBalances()).rejects.toThrow('Invalid stored SMS credit balance.')
  })
})
