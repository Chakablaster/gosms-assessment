
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import nodemailer from 'nodemailer'
import { brands, companies, outlets } from './data/mockData.js'
import { createCreditAllocationService, CreditAllocationError } from './services/creditAllocationService.js'
import { createEmailService, EmailError } from './services/emailService.js'
import { createQuotationService, QuotationError } from './services/quotationService.js'

if (existsSync('.env')) process.loadEnvFile('.env')

let registeredEmails

try {
  registeredEmails = JSON.parse(process.env.CLIENT_EMAILS || '{}')

  if (!registeredEmails || Array.isArray(registeredEmails) || typeof registeredEmails !== 'object') {
    throw new Error()
  }
} catch {
  throw new Error('CLIENT_EMAILS must be a JSON object mapping brand IDs to email addresses.')
}

const smtpPort = Number(process.env.SMTP_PORT || '587')

const configured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_FROM &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  Number.isInteger(smtpPort)
)

const transporter = configured
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

const quotationService = createQuotationService({ brands, companies, outlets })
const creditAllocationService = createCreditAllocationService({ companies, outlets })

const emailService = createEmailService({
  brands,
  companies,
  outlets,
  registeredEmails,
  senderAddress: process.env.SMTP_FROM,
  sendMail: transporter ? (message) => transporter.sendMail(message) : null,
})

function respond(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })

  res.end(JSON.stringify(data))
}

async function readJson(req) {
  let raw = ''

  for await (const chunk of req) {
    raw += chunk.toString()

    if (Buffer.byteLength(raw) > 65536) {
      throw new QuotationError('Request too large.', 413)
    }
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new QuotationError('Invalid request body.', 400)
  }
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/businesses') {
      respond(res, 200, { brands, companies, outlets })
      return
    }

    if (req.method === 'GET' && req.url === '/api/credits') {
      respond(res, 200, creditAllocationService.getBalances())
      return
    }

    if (req.method === 'POST' && req.url === '/api/quotations') {
      const payload = await readJson(req)
      const quotation = quotationService.generate(payload)
      const allocation = creditAllocationService.allocate(quotation)

      respond(res, 201, { quotation, allocation })
      return
    }

    if (req.method === 'POST' && req.url === '/api/quotations/email') {
      const payload = await readJson(req)
      const result = await emailService.sendQuotation(payload?.quotation)

      respond(res, 200, {
        status: 'sent',
        recipient: result.recipient,
        alreadySent: result.alreadySent,
      })
      return
    }

    respond(res, 404, { error: 'Not found.' })
  } catch (error) {
    const allocationFailure = error instanceof CreditAllocationError
    const expected = error instanceof QuotationError ||
      allocationFailure ||
      error instanceof EmailError

    respond(res, expected ? error.status : 500, {
      error: allocationFailure
        ? `SMS credit allocation failed: ${error.message}`
        : expected ? error.message : 'Server error.',
    })
  }
}).listen(3001, '127.0.0.1', () => {
  console.log('GoSMS API listening on localhost')
})
