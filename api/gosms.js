
import { Redis } from '@upstash/redis'
import nodemailer from 'nodemailer'
import { brands, companies, outlets } from '../backend/data/mockData.js'
import { createQuotationService, QuotationError } from '../backend/services/quotationService.js'
import { createCreditAllocationService, CreditAllocationError } from '../backend/services/creditAllocationService.js'
import { ReloadError } from '../backend/services/reloadService.js'
import { createEmailService, EmailError } from '../backend/services/emailService.js'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  automaticDeserialization: false,
})

const quotationService = createQuotationService({ brands, companies, outlets })
const BALANCES_KEY = 'gosms:v1:outlet-balances'

const ALLOCATE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then
  return {0, existing}
end

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
    ? Object.entries(creditsByOutlet).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    : creditsByOutlet

  return JSON.stringify({ brandId, creditsByOutlet: sortedCredits })
}

async function getBalances() {
  const saved = await redis.hgetall(BALANCES_KEY) ?? {}
  const outletBalances = {}
  const companyBalances = Object.fromEntries(companies.map((company) => [company.id, '0']))

  for (const outlet of outlets) {
    const credits = BigInt(saved[outlet.id] ?? '0')
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
      allocation: {
        reference: record.quotation.reference,
        alreadyAllocated: true,
      },
    }
  }

  const quotation = quotationService.generate({ brandId, creditsByOutlet })
  createCreditAllocationService({ companies, outlets }).allocate(quotation)

  const allocations = quotation.companies.flatMap((company) => company.outlets)
  const record = JSON.stringify({ signature, quotation })

  const result = await redis.eval(
    ALLOCATE_SCRIPT,
    [operationKey, BALANCES_KEY],
    [record, ...allocations.flatMap((item) => [item.outletId, item.credits])]
  )

  if (Number(result[0]) === -1) {
    throw new ReloadError(String(result[1]))
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

const smtpPort = Number(process.env.SMTP_PORT || '587')

const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_FROM &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  Number.isInteger(smtpPort) &&
  smtpPort > 0 &&
  smtpPort <= 65535
)

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null

let registeredEmails

try {
  registeredEmails = JSON.parse(process.env.CLIENT_EMAILS || '{}')

  if (
    !registeredEmails ||
    Array.isArray(registeredEmails) ||
    typeof registeredEmails !== 'object'
  ) {
    throw new Error('Invalid email configuration.')
  }
} catch {
  throw new Error('CLIENT_EMAILS must be a JSON object mapping brand IDs to email addresses.')
}

const emailService = createEmailService({
  brands,
  companies,
  outlets,
  registeredEmails,
  senderAddress: process.env.SMTP_FROM,
  sendMail: transporter ? (message) => transporter.sendMail(message) : null,
})

function respond(response, status, data) {
  response.setHeader('Cache-Control', 'no-store')
  response.status(status).json(data)
}

function readBody(request) {
  let body = request.body

  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(body.toString())
    } catch {
      throw new QuotationError('Invalid request body.', 400)
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new QuotationError('Invalid request body.', 400)
  }

  return body
}

export default async function handler(request, response) {
  try {
    const resource = request.query?.resource

    if (request.method === 'GET' && resource === 'businesses') {
      respond(response, 200, { brands, companies, outlets })
      return
    }

    if (request.method === 'GET' && resource === 'credits') {
      respond(response, 200, await getBalances())
      return
    }

    if (request.method === 'POST' && resource === 'quotations') {
      const result = await processReload(readBody(request))
      respond(response, result.allocation.alreadyAllocated ? 200 : 201, result)
      return
    }

    if (request.method === 'POST' && resource === 'email') {
      const result = await emailService.sendQuotation(readBody(request).quotation)

      respond(response, 200, {
        status: 'sent',
        recipient: result.recipient,
        alreadySent: result.alreadySent,
      })
      return
    }

    respond(response, 404, { error: 'Not found.' })
  } catch (error) {
    const allocationFailure = error instanceof CreditAllocationError
    const expected =
      error instanceof QuotationError ||
      allocationFailure ||
      error instanceof ReloadError ||
      error instanceof EmailError

    respond(response, expected ? error.status : 500, {
      error: allocationFailure
        ? `SMS credit allocation failed: ${error.message}`
        : expected ? error.message : 'Server error.',
    })
  }
}
