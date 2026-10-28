import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { getBusinesses, createQuotation } from '../services/gosmsApi'
import { sendQuotationEmail } from '../services/quotationEmail'
import { createQuotationService } from '../../../backend/services/quotationService'
import { brands, companies, outlets } from '../../../backend/data/mockData'

vi.mock('../services/gosmsApi', () => ({
  getBusinesses: vi.fn(),
  createQuotation: vi.fn(),
}))

vi.mock('../services/quotationEmail', () => ({
  sendQuotationEmail: vi.fn(),
}))

async function chooseBrand() {
  await screen.findByRole('button', { name: 'Client Brand' })
  fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: 'Silvertree Restaurants' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

async function generate() {
  fireEvent.change(
    screen.getByRole('textbox', { name: 'SMS credits for Binjai Park (ST-BP-01)' }),
    { target: { value: '100' } }
  )

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))
  })
}

describe('quotation email delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBusinesses.mockResolvedValue({ brands, companies, outlets })
    const service = createQuotationService({ brands, companies, outlets })

    createQuotation.mockImplementation(async (brandId, creditsByOutlet) =>
      service.generate({ brandId, creditsByOutlet })
    )
  })

  it('shows one success toast after emailing a generated quotation', async () => {
    sendQuotationEmail.mockResolvedValue({
      status: 'sent',
      recipient: 'client@example.com',
    })

    render(<App />)
    await chooseBrand()
    await generate()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Quotation generated and emailed successfully.'
    )

    expect(screen.queryByLabelText('Email delivery status')).not.toBeInTheDocument()
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'silvertree', totalCredits: '100' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Email delivery status')).not.toBeInTheDocument()
  })

  it('shows a failure toast and retains the retry option', async () => {
    sendQuotationEmail
      .mockRejectedValueOnce(new Error('Email could not be sent. Please try again.'))
      .mockResolvedValueOnce({ status: 'sent', recipient: 'client@example.com' })

    render(<App />)
    await chooseBrand()
    await generate()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quotation generated, but the email could not be sent.'
    )

    expect(screen.getByLabelText('Email delivery status')).toHaveTextContent('Email not sent.')
    expect(screen.getByRole('button', { name: 'Retry Email' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry Email' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Quotation email sent successfully.'
    )

    expect(sendQuotationEmail).toHaveBeenCalledTimes(2)
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Retry Email' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email delivery status')).not.toBeInTheDocument()
  })

  it('waits for email delivery before showing the final toast', async () => {
    let resolveEmail

    sendQuotationEmail.mockImplementationOnce(() => new Promise((resolve) => {
      resolveEmail = resolve
    }))

    render(<App />)
    await chooseBrand()
    await generate()

    expect(screen.getByRole('heading', { name: 'SMS Credit Quotation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email delivery status')).toHaveTextContent(
      'Sending quotation to client…'
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(async () => {
      resolveEmail({ status: 'sent', recipient: 'client@example.com' })
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Quotation generated and emailed successfully.'
    )
    expect(screen.queryByLabelText('Email delivery status')).not.toBeInTheDocument()
  })

  it('does not initiate an email for an invalid draft', async () => {
    render(<App />)
    await chooseBrand()

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(createQuotation).not.toHaveBeenCalled()
    expect(sendQuotationEmail).not.toHaveBeenCalled()
  })

  it('does not email a quotation rejected by the backend', async () => {
    createQuotation.mockRejectedValueOnce(new Error('Quotation generation failed.'))

    render(<App />)
    await chooseBrand()
    await generate()

    expect(screen.getByRole('alert')).toHaveTextContent('Quotation generation failed.')
    expect(sendQuotationEmail).not.toHaveBeenCalled()
    expect(screen.queryByText('Quotation generated and emailed successfully.')).not.toBeInTheDocument()
  })
})