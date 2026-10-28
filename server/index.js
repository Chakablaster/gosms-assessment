import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import nodemailer from 'nodemailer'
import { brands, companies, outlets } from '../src/data/mockData.js'
import { createEmailService, EmailError } from './emailService.js'

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

createServer(async (req, res) => {
  if (req.url !== '/api/quotations/email' || req.method !== 'POST') {
    respond(res, 404, { error: 'Not found.' })
    return
  }

  try {
    let raw = ''

    for await (const chunk of req) {
      raw += chunk.toString()

      if (Buffer.byteLength(raw) > 65536) {
        throw new EmailError('Request too large.', 413)
      }
    }

    let payload

    try {
      payload = JSON.parse(raw)
    } catch {
      throw new EmailError('Invalid request body.', 400)
    }

    const result = await emailService.sendQuotation(payload?.quotation)

    respond(res, 200, {
      status: 'sent',
      recipient: result.recipient,
      alreadySent: result.alreadySent,
    })
  } catch (error) {
    respond(res, error instanceof EmailError ? error.status : 500, {
      error: error instanceof EmailError
        ? error.message
        : 'Email service is unavailable.',
    })
  }
}).listen(3001, '127.0.0.1', () => {
  console.log('GoSMS email API listening on localhost')
})
