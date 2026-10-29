import { Redis } from '@upstash/redis'
import nodemailer from 'nodemailer'
import { brands, companies, outlets } from '../backend/data/mockData.js'
import { createQuotationService, QuotationError } from '../backend/services/quotationService.js'
import { createCreditAllocationService, CreditAllocationError } from '../backend/services/creditAllocationService.js'
import { ReloadError } from '../backend/services/reloadService.js'
import { createPersistentReloadService } from '../backend/services/persistentReloadService.js'
import { createEmailService, EmailError } from '../backend/services/emailService.js'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  automaticDeserialization: false,
})

const reloadService = createPersistentReloadService({
  redis,
  quotationService: createQuotationService({ brands, companies, outlets }),
  validateAllocation: (quotation) => createCreditAllocationService({ companies, outlets }).allocate(quotation),
  companies,
  outlets,
})

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
      const [balances, historyCounts] = await Promise.all([
        reloadService.getBalances(),
        Promise.all(brands.map((brand) => reloadService.getHistoryCount(brand.id))),
      ])

      respond(response, 200, {
        ...balances,
        historyCountByBrand: Object.fromEntries(
          brands.map((brand, index) => [brand.id, historyCounts[index]])
        ),
      })
      return
    }

    if (request.method === 'GET' && resource === 'history') {
      const brandId = request.query?.brandId

      if (typeof brandId !== 'string' || !brands.some((brand) => brand.id === brandId)) {
        throw new QuotationError('Client not found.', 404)
      }

      respond(response, 200, { requests: await reloadService.getHistory(brandId) })
      return
    }

    if (request.method === 'POST' && resource === 'quotations') {
      const result = await reloadService.processReload(readBody(request))
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
