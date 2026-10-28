import { generateQuotation } from '../logic/quotation.js'

export class EmailError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function createEmailService({ brands, companies, outlets, registeredEmails, senderAddress, sendMail }) {
  const sent = new Map()
  const pending = new Map()

  async function sendQuotation(quotation) {
    if (!quotation || typeof quotation !== 'object' || typeof quotation.brandId !== 'string') {
      throw new EmailError('Invalid quotation.', 400)
    }

    const brand = brands.find((item) => item.id === quotation.brandId)
    if (!brand) throw new EmailError('Client not found.', 404)

    const recipient = registeredEmails[brand.id]

    if (!recipient) {
      throw new EmailError('No registered email address for this client.', 422)
    }

    if (typeof recipient !== 'string' || !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(recipient)) {
      throw new EmailError('The registered client email address is invalid.', 422)
    }

    const timestamp = Date.parse(quotation.generatedAt)

    if (!Number.isFinite(timestamp) || quotation.reference !== `QT-${timestamp}` || !Array.isArray(quotation.companies)) {
      throw new EmailError('Invalid quotation.', 400)
    }

    const credits = {}
    const knownOutlets = outlets.filter((outlet) => outlet.brandId === brand.id)
    const outletIds = new Set(knownOutlets.map((outlet) => outlet.id))

    for (const company of quotation.companies) {
      if (!company || !Array.isArray(company.outlets)) {
        throw new EmailError('Invalid quotation.', 400)
      }

      for (const outlet of company.outlets) {
        if (
          !outletIds.has(outlet?.outletId) ||
          Object.hasOwn(credits, outlet.outletId) ||
          typeof outlet.credits !== 'string' ||
          !/^[1-9]\d*$/.test(outlet.credits) ||
          !Number.isSafeInteger(Number(outlet.credits))
        ) {
          throw new EmailError('Invalid quotation.', 400)
        }

        credits[outlet.outletId] = outlet.credits
      }
    }

    const selectedOutlets = knownOutlets.map((outlet) => ({
      ...outlet,
      companyName: companies.find((company) => company.id === outlet.companyId)?.name,
    }))

    const expected = generateQuotation(brand, selectedOutlets, credits, new Date(timestamp)).quotation

    if (
      !expected ||
      quotation.brandName !== expected.brandName ||
      quotation.totalCredits !== expected.totalCredits ||
      JSON.stringify(quotation.companies) !== JSON.stringify(expected.companies)
    ) {
      throw new EmailError('Invalid quotation.', 400)
    }

    if (sent.has(quotation.reference)) {
      return { recipient, alreadySent: true }
    }

    if (pending.has(quotation.reference)) {
      return pending.get(quotation.reference)
    }

    if (!senderAddress || !sendMail) {
      throw new EmailError('Email service is not configured.', 503)
    }

    const body = [
      'GoSMS — SMS Credit Quotation',
      `Reference: ${expected.reference}`,
      `Date: ${new Date(expected.generatedAt).toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`,
      `Client: ${expected.brandName}`,
      '',
      ...expected.companies.flatMap((company) => [
        company.companyName,
        ...company.outlets.map((outlet) =>
          `${outlet.outletName} (${outlet.outletCode}): ${outlet.credits} SMS credits`
        ),
        `Company Total: ${company.totalCredits} SMS credits`,
        '',
      ]),
      `Total SMS Credits: ${expected.totalCredits}`,
    ].join('\n')

    const task = (async () => {
      try {
        const result = await sendMail({
          from: senderAddress,
          to: recipient,
          subject: `GoSMS Quotation ${expected.reference}`,
          text: body,
        })

        if (!result?.accepted?.includes(recipient)) {
          throw new Error('Recipient was not accepted by the SMTP server')
        }

        sent.set(quotation.reference, recipient)

        return { recipient, alreadySent: false }
      } catch {
        throw new EmailError('Email could not be sent. Please try again.', 502)
      } finally {
        pending.delete(quotation.reference)
      }
    })()

    pending.set(quotation.reference, task)
    return task
  }

  return { sendQuotation }
}
