import { describe, expect, it, vi } from 'vitest'
import { createEmailService } from '../../server/emailService'
import { sendQuotationEmail } from '../services/quotationEmail'
import { generateQuotation } from '../logic/quotation'

const brands = [{ id: 'silvertree', name: 'Silvertree Restaurants' }]
const companies = [
  { id: 'oris', name: 'Oris Sdn Bhd' },
  { id: 'binjai', name: 'Binjai Sdn Bhd' },
]
const outlets = [
  { id: 'st-1', brandId: 'silvertree', companyId: 'oris', companyName: 'Oris Sdn Bhd', name: 'First', outletCode: 'ST-01' },
  { id: 'st-2', brandId: 'silvertree', companyId: 'binjai', companyName: 'Binjai Sdn Bhd', name: 'Second', outletCode: 'ST-02' },
]

const quotation = generateQuotation(
  brands[0],
  outlets,
  { 'st-1': '7', 'st-2': '4' },
  new Date('2026-10-29T02:00:00Z')
).quotation

function service(emails = { silvertree: 'client@example.com' }, sendMail = vi.fn().mockResolvedValue({ accepted: ['client@example.com'] })) {
  return createEmailService({
    brands,
    companies,
    outlets,
    registeredEmails: emails,
    senderAddress: 'sender@example.com',
    sendMail,
  })
}

describe('quotation email service', () => {
  it('sends once to the registered recipient and includes every company', async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ['client@example.com'] })
    const sender = service(undefined, sendMail)

    expect((await sender.sendQuotation(quotation)).recipient).toBe('client@example.com')

    const message = sendMail.mock.calls[0][0]

    expect(message.text).toContain('Oris Sdn Bhd')
    expect(message.text).toContain('Binjai Sdn Bhd')
    expect(message.text).toContain('Total SMS Credits: 11')

    await sender.sendQuotation(quotation)
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  it('rejects missing and invalid recipient addresses', async () => {
    await expect(service({}).sendQuotation(quotation)).rejects.toThrow('No registered email')
    await expect(service({ silvertree: 'invalid' }).sendQuotation(quotation)).rejects.toThrow('invalid')
  })

  it('does not falsely report a rejected or failed SMTP send', async () => {
    await expect(
      service(undefined, vi.fn().mockResolvedValue({ accepted: [] })).sendQuotation(quotation)
    ).rejects.toThrow('could not be sent')

    await expect(
      service(undefined, vi.fn().mockRejectedValue(new Error('offline'))).sendQuotation(quotation)
    ).rejects.toThrow('could not be sent')
  })

  it('can retry after failure', async () => {
    const sendMail = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ accepted: ['client@example.com'] })

    const sender = service(undefined, sendMail)

    await expect(sender.sendQuotation(quotation)).rejects.toThrow()
    await expect(sender.sendQuotation(quotation)).resolves.toMatchObject({
      recipient: 'client@example.com',
    })

    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it('rejects changed company information and outlet allocations', async () => {
    const altered = {
      ...quotation,
      companies: [
        { ...quotation.companies[0], companyName: 'Unknown' },
        ...quotation.companies.slice(1),
      ],
    }

    await expect(service().sendQuotation(altered)).rejects.toThrow('Invalid quotation')
  })

  it('submits to the API and surfaces its failures', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'No registered email address for this client.' }),
    })

    await expect(sendQuotationEmail(quotation, request)).rejects.toThrow('No registered email')

    expect(JSON.parse(request.mock.calls[0][1].body).quotation.reference)
      .toBe(quotation.reference)
  })
})
