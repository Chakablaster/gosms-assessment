import { describe, expect, it, vi } from 'vitest'
import { brands, companies, outlets } from '../../../backend/data/mockData.js'
import { generateQuotation } from '../../../backend/logic/quotation.js'
import { createEmailService } from '../../../backend/services/emailService.js'
import { sendQuotationEmail } from '../services/quotationEmail'

const clientEmail = 'client@example.com'
const senderEmail = 'sender@example.com'
const silvertree = brands.find((brand) => brand.id === 'silvertree')
const silvertreeOutlets = outlets
  .filter((outlet) => outlet.brandId === silvertree.id)
  .map((outlet) => ({
    ...outlet,
    companyName: companies.find((company) => company.id === outlet.companyId).name,
  }))

// Use a real quotation assembled from the business records. Its two selected
// outlets belong to different companies, so both company sections matter.
const quotation = generateQuotation(
  silvertree,
  silvertreeOutlets,
  { 'st-001': '100', 'st-003': '200' },
  new Date('2026-10-29T02:00:00.000Z')
).quotation

function createSender({
  registeredEmails = { silvertree: clientEmail },
  senderAddress = senderEmail,
  sendMail = vi.fn().mockResolvedValue({ accepted: [clientEmail] }),
} = {}) {
  return createEmailService({
    brands,
    companies,
    outlets,
    registeredEmails,
    senderAddress,
    sendMail,
  })
}

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

describe('backend quotation email service', () => {
  // Check that an approved quotation goes to the registered recipient with the
  // correct sender, reference, and both company breakdowns. A valid email must
  // give the client the actual outlet allocations, not just a grand total.
  it('sends the complete quotation to the registered client', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: [clientEmail] })
    const sender = createSender({ sendMail })

    await expect(sender.sendQuotation(quotation)).resolves.toEqual({
      recipient: clientEmail,
      alreadySent: false,
    })
    expect(sendMail).toHaveBeenCalledTimes(1)

    const message = sendMail.mock.calls[0][0]
    expect(message.from).toBe(senderEmail)
    expect(message.to).toBe(clientEmail)
    expect(message.subject).toBe(`GoSMS Quotation ${quotation.reference}`)
    expect(message.text).toContain('Client: Silvertree Restaurants')
    expect(message.text).toContain('Silvertree Oris Sdn Bhd')
    expect(message.text).toContain('Binjai Park (ST-BP-01): 100 SMS credits')
    expect(message.text).toContain('Silvertree Binjai Sdn Bhd')
    expect(message.text).toContain('Binjai Park (ST-BP-03): 200 SMS credits')
    expect(message.text).toContain('Total SMS Credits: 300')
  })

  // Check that sending a quotation again after successful delivery does not
  // contact the mail server twice. Reopening or retrying a completed delivery
  // must not send duplicate quotations to the client.
  it('does not resend a quotation that was already delivered', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: [clientEmail] })
    const sender = createSender({ sendMail })

    expect(await sender.sendQuotation(quotation)).toMatchObject({ alreadySent: false })
    expect(await sender.sendQuotation(quotation)).toEqual({
      recipient: clientEmail,
      alreadySent: true,
    })
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  // Check what happens when two requests try to send the same quotation before
  // the first delivery finishes. Both callers should share that delivery,
  // rather than starting two SMTP requests while the first is still pending.
  it('shares an email delivery that is already in progress', async () => {
    let finishSending
    const sendMail = vi.fn(() => new Promise((resolve) => {
      finishSending = resolve
    }))
    const sender = createSender({ sendMail })

    const first = sender.sendQuotation(quotation)
    const second = sender.sendQuotation(quotation)

    expect(sendMail).toHaveBeenCalledTimes(1)
    finishSending({ accepted: [clientEmail] })

    expect(await Promise.all([first, second])).toEqual([
      { recipient: clientEmail, alreadySent: false },
      { recipient: clientEmail, alreadySent: false },
    ])
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  // Check that an email is refused when the selected brand has no registered
  // recipient. Sending to a guessed or fallback address would risk sharing a
  // client's quotation with someone who should not receive it.
  it('rejects a brand without a registered email address', async () => {
    const sendMail = vi.fn()
    const sender = createSender({ registeredEmails: {}, sendMail })

    await expect(sender.sendQuotation(quotation)).rejects.toMatchObject({
      status: 422,
      message: 'No registered email address for this client.',
    })
    expect(sendMail).not.toHaveBeenCalled()
  })

  // Check that a malformed recipient address is rejected before SMTP is called.
  // It is better to report a configuration problem than repeatedly attempt to
  // deliver a quotation to an unusable address.
  it('rejects an invalid registered email address', async () => {
    const sendMail = vi.fn()
    const sender = createSender({ registeredEmails: { silvertree: 'not-an-email' }, sendMail })

    await expect(sender.sendQuotation(quotation)).rejects.toMatchObject({
      status: 422,
      message: 'The registered client email address is invalid.',
    })
    expect(sendMail).not.toHaveBeenCalled()
  })

  // Check that a quotation for an unknown brand cannot be emailed. Without
  // a matching client record, the service cannot verify who should receive it.
  it('rejects a quotation for an unknown client', async () => {
    const sendMail = vi.fn()
    const sender = createSender({ sendMail })

    await expect(sender.sendQuotation({ ...quotation, brandId: 'unknown-brand' })).rejects.toMatchObject({
      status: 404,
      message: 'Client not found.',
    })
    expect(sendMail).not.toHaveBeenCalled()
  })

  // Check that the service refuses delivery when its sender address or mail
  // transport is missing. A quotation must not be marked as emailed when the
  // application has no way to send it.
  it('reports missing email service configuration', async () => {
    const sendMail = vi.fn()

    await expect(createSender({ senderAddress: '', sendMail }).sendQuotation(quotation)).rejects.toMatchObject({
      status: 503,
      message: 'Email service is not configured.',
    })
    await expect(createSender({ sendMail: null }).sendQuotation(quotation)).rejects.toMatchObject({
      status: 503,
      message: 'Email service is not configured.',
    })
    expect(sendMail).not.toHaveBeenCalled()
  })

  // Check that changing a company name in a generated quotation is detected.
  // The email service must use verified backend details rather than sending
  // altered business information supplied in the request.
  it('rejects changed company details in a quotation', async () => {
    const sendMail = vi.fn()
    const sender = createSender({ sendMail })
    const altered = structuredClone(quotation)
    altered.companies[0].companyName = 'Different Company'

    await expect(sender.sendQuotation(altered)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid quotation.',
    })
    expect(sendMail).not.toHaveBeenCalled()
  })

  // Check that changing an outlet's allocated credits is caught before email
  // delivery. The client must not receive amounts that differ from the
  // quotation's validated company and overall totals.
  it('rejects changed outlet credit allocations', async () => {
    const sendMail = vi.fn()
    const sender = createSender({ sendMail })
    const altered = structuredClone(quotation)
    altered.companies[0].outlets[0].credits = '150'

    await expect(sender.sendQuotation(altered)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid quotation.',
    })
    expect(sendMail).not.toHaveBeenCalled()
  })

  // Check that SMTP returning no accepted recipients is treated as a failed
  // send. A resolved transport call is not proof that the intended client
  // actually accepted delivery.
  it('does not report success when SMTP rejects the recipient', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: [] })
    const sender = createSender({ sendMail })

    await expect(sender.sendQuotation(quotation)).rejects.toMatchObject({
      status: 502,
      message: 'Email could not be sent. Please try again.',
    })
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  // Check that a transport exception becomes a useful delivery failure instead
  // of appearing to the caller as a successful email. An SMTP outage is not a
  // completed delivery, even if the quotation itself is valid.
  it('reports an email transport failure', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('Connection lost.'))
    const sender = createSender({ sendMail })

    await expect(sender.sendQuotation(quotation)).rejects.toMatchObject({
      status: 502,
      message: 'Email could not be sent. Please try again.',
    })
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  // Check that a failed send can be retried with the same quotation. The
  // service must not record a failed attempt as delivered, but it should
  // prevent another send once the retry succeeds.
  it('allows retrying failed delivery and records the successful attempt', async () => {
    const sendMail = vi.fn()
      .mockRejectedValueOnce(new Error('Connection lost.'))
      .mockResolvedValueOnce({ accepted: [clientEmail] })
    const sender = createSender({ sendMail })

    await expect(sender.sendQuotation(quotation)).rejects.toMatchObject({ status: 502 })
    await expect(sender.sendQuotation(quotation)).resolves.toEqual({
      recipient: clientEmail,
      alreadySent: false,
    })
    await expect(sender.sendQuotation(quotation)).resolves.toEqual({
      recipient: clientEmail,
      alreadySent: true,
    })
    expect(sendMail).toHaveBeenCalledTimes(2)
  })
})

describe('frontend quotation email request', () => {
  // Check that the frontend posts the complete quotation to the current email
  // endpoint and accepts the server's sent status. The backend needs the full
  // quotation to validate it before delivery.
  it('sends the quotation to the email API', async () => {
    const result = { status: 'sent', recipient: clientEmail, alreadySent: false }
    const request = vi.fn().mockResolvedValue(response(200, result))

    await expect(sendQuotationEmail(quotation, request)).resolves.toEqual(result)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/gosms?resource=email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotation }),
    })
  })

  // Check that a specific backend email error reaches the frontend unchanged.
  // The user should be told that their client has no registered address rather
  // than being given an unrelated or generic delivery message.
  it('shows the error returned by the email API', async () => {
    const request = vi.fn().mockResolvedValue(response(422, {
      error: 'No registered email address for this client.',
    }))

    await expect(sendQuotationEmail(quotation, request))
      .rejects.toThrow('No registered email address for this client.')
  })

  // Check that a failed fetch is identified as an unavailable email service.
  // A connection failure gives the browser no delivery confirmation, so it
  // should not show a successful send.
  it('reports when the email API cannot be reached', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Network unavailable.'))

    await expect(sendQuotationEmail(quotation, request))
      .rejects.toThrow('Email service is unavailable. Please try again.')
  })

  // Check that a response containing invalid JSON is rejected. An HTTP success
  // code is insufficient if the frontend cannot read the delivery result.
  it('rejects an unreadable email API response', async () => {
    const request = vi.fn().mockResolvedValue({
      ...response(200, null),
      json: async () => { throw new SyntaxError('Invalid JSON.') },
    })

    await expect(sendQuotationEmail(quotation, request))
      .rejects.toThrow('Email service returned an invalid response.')
  })

  // Check that the backend must explicitly report sent, even after a successful
  // HTTP response. A pending or failed status must not be treated as delivery.
  it('rejects an API response without a successful delivery status', async () => {
    const request = vi.fn().mockResolvedValue(response(200, { status: 'pending' }))

    await expect(sendQuotationEmail(quotation, request))
      .rejects.toThrow('Email could not be sent. Please try again.')
  })

  // Check that a failed email response without an error message still produces
  // something useful. The frontend must not crash or report success just
  // because the backend omitted its explanation.
  it('uses a clear fallback when the email API returns no error message', async () => {
    const request = vi.fn().mockResolvedValue(response(502, {}))

    await expect(sendQuotationEmail(quotation, request))
      .rejects.toThrow('Email could not be sent. Please try again.')
  })
})
