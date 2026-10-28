import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { sendQuotationEmail } from '../services/quotationEmail'

vi.mock('../services/quotationEmail', () => ({
  sendQuotationEmail: vi.fn(),
}))

function chooseBrand() {
  fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: 'Silvertree Restaurants' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

function generate() {
  fireEvent.change(
    screen.getByRole('textbox', { name: 'SMS credits for Binjai Park (ST-BP-01)' }),
    { target: { value: '100' } }
  )

  fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))
}

describe('quotation email delivery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('emails a generated quotation once and shows success', async () => {
    sendQuotationEmail.mockResolvedValue({
      status: 'sent',
      recipient: 'client@example.com',
    })

    render(<App />)
    chooseBrand()
    generate()

    expect(await screen.findByText('Email sent to the registered client address.'))
      .toBeInTheDocument()

    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'silvertree', totalCredits: '100' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)
  })

  it('shows failure without reporting email success and permits retry', async () => {
    sendQuotationEmail
      .mockRejectedValueOnce(new Error('Email could not be sent. Please try again.'))
      .mockResolvedValueOnce({ status: 'sent', recipient: 'client@example.com' })

    render(<App />)
    chooseBrand()
    generate()

    expect(await screen.findByRole('alert')).toHaveTextContent('Email not sent.')

    fireEvent.click(screen.getByRole('button', { name: 'Retry Email' }))

    expect(await screen.findByText('Email sent to the registered client address.'))
      .toBeInTheDocument()

    expect(sendQuotationEmail).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: 'Retry Email' })).not.toBeInTheDocument()
  })

  it('does not initiate an email for an invalid draft', () => {
    render(<App />)
    chooseBrand()

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(sendQuotationEmail).not.toHaveBeenCalled()
  })
})
