import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { getBusinesses, getCreditBalances, getQuotationHistory, createQuotation } from '../services/gosmsApi'
import { sendQuotationEmail } from '../services/quotationEmail'
import { createQuotationService } from '../../../backend/services/quotationService'
import { createCreditAllocationService, CreditAllocationError } from '../../../backend/services/creditAllocationService'
import { brands, companies, outlets } from '../../../backend/data/mockData'

vi.mock('../services/gosmsApi', () => ({
  getBusinesses: vi.fn(),
  getCreditBalances: vi.fn(),
  getQuotationHistory: vi.fn(),
  createQuotation: vi.fn(),
}))

vi.mock('../services/quotationEmail', () => ({
  sendQuotationEmail: vi.fn(),
}))

async function openSilvertreeTopUp() {
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: 'Silvertree Restaurants' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('heading', { name: 'SMS Top Up' })
}

function enterCredits(amount) {
  fireEvent.change(screen.getByRole('textbox', {
    name: 'SMS credits for Binjai Park (ST-BP-01)',
  }), { target: { value: amount } })
}

async function generateQuotation() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))
  await screen.findByRole('heading', { name: 'SMS Credit Quotation' })
}

describe('quotation email delivery', () => {
  let allocationService
  let savedHistory

  beforeEach(() => {
    vi.resetAllMocks()

    const quotationService = createQuotationService({ brands, companies, outlets })
    allocationService = createCreditAllocationService({ companies, outlets })
    savedHistory = new Map()

    // Keep the quotation and allocation rules real. Only the API and email
    // transport are mocked, so the balance checks reflect successful top ups.
    getBusinesses.mockResolvedValue({ brands, companies, outlets })
    getCreditBalances.mockImplementation(async () => allocationService.getBalances())
    getQuotationHistory.mockImplementation(async (brandId) => savedHistory.get(brandId) ?? [])
    createQuotation.mockImplementation(async (brandId, creditsByOutlet, operationId) => {
      const quotation = quotationService.generate({ brandId, creditsByOutlet })
      allocationService.allocate(quotation)

      const saved = { id: operationId, brandId, status: 'generated', quotation }
      savedHistory.set(brandId, [saved, ...(savedHistory.get(brandId) ?? [])])
      return quotation
    })
    sendQuotationEmail.mockResolvedValue({ status: 'sent' })
  })

  // Check that a completed top up sends its quotation by email, and that
  // opening the same quotation from History does not send a second email.
  // Viewing an old record must be read-only, not another delivery attempt.
  it('sends a generated quotation once, even when it is viewed again', async () => {
    await openSilvertreeTopUp()
    enterCredits('100')
    await generateQuotation()

    expect(await screen.findByText(
      'Quotation generated and emailed successfully. SMS credits have been allocated.'
    )).toBeInTheDocument()

    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).toHaveBeenCalledWith(expect.objectContaining({
      brandId: 'silvertree',
      totalCredits: '100',
    }))
    expect(screen.queryByLabelText('Email delivery status')).not.toBeInTheDocument()

    const originalQuotation = sendQuotationEmail.mock.calls[0][0]
    fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
    fireEvent.click(screen.getByRole('button', { name: 'History' }))

    // History is now loaded through the API rather than inferred solely from
    // the active draft. Wait for that load before opening the saved quotation.
    await waitFor(() => expect(getQuotationHistory).toHaveBeenCalledWith('silvertree'))
    await waitFor(() => {
      expect(screen.queryByText('Loading quotation history...')).not.toBeInTheDocument()
    })
    expect(screen.getByText(originalQuotation.reference)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    expect(screen.getByRole('heading', { name: 'SMS Credit Quotation' })).toBeInTheDocument()
    expect(screen.getByText(originalQuotation.reference)).toBeInTheDocument()
    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')
  })

  // Check that failed email delivery leaves the quotation and allocated credits
  // intact, and that Retry Email sends the same quotation rather than generating
  // or allocating anything again. Delivery and credit allocation are separate steps.
  it('retries a failed email without repeating the top up', async () => {
    sendQuotationEmail
      .mockRejectedValueOnce(new Error('Email could not be sent. Please try again.'))
      .mockResolvedValueOnce({ status: 'sent' })

    await openSilvertreeTopUp()
    enterCredits('100')
    await generateQuotation()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quotation generated, but the email could not be sent. SMS credits were allocated.'
    )
    expect(screen.getByLabelText('Email delivery status')).toHaveTextContent('Email not sent.')
    expect(screen.getByRole('button', { name: 'Retry Email' })).toBeInTheDocument()
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry Email' }))

    expect(await screen.findByText('Quotation email sent successfully.')).toBeInTheDocument()
    expect(sendQuotationEmail).toHaveBeenCalledTimes(2)
    expect(sendQuotationEmail.mock.calls[1][0]).toEqual(sendQuotationEmail.mock.calls[0][0])
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')
    expect(screen.queryByLabelText('Email delivery status')).not.toBeInTheDocument()
  })

  // Check that credit allocation is confirmed while the email is still being
  // delivered. A slow email service must not leave the user wondering whether
  // the top up worked or make them generate another quotation.
  it('shows the allocation result while email delivery is pending', async () => {
    let finishEmail
    sendQuotationEmail.mockImplementationOnce(() => new Promise((resolve) => {
      finishEmail = resolve
    }))

    await openSilvertreeTopUp()
    enterCredits('100')
    await generateQuotation()

    expect(screen.getByLabelText('Email delivery status')).toHaveTextContent(
      'Sending quotation to client…'
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Quotation generated. SMS credits allocated successfully.'
    )
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishEmail({ status: 'sent' })
    })

    expect(await screen.findByText(
      'Quotation generated and emailed successfully. SMS credits have been allocated.'
    )).toBeInTheDocument()
    expect(screen.queryByLabelText('Email delivery status')).not.toBeInTheDocument()
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')
  })

  // Check that an empty draft cannot start quotation generation or email
  // delivery. There is no valid credit allocation to confirm or email yet.
  it('does not send email when no credits have been entered', async () => {
    await openSilvertreeTopUp()
    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Allocate at least 1 SMS credit to generate a quotation.'
    )
    expect(createQuotation).not.toHaveBeenCalled()
    expect(sendQuotationEmail).not.toHaveBeenCalled()
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('0')
  })

  // Check that a quotation rejected by the backend never reaches the email
  // service. A known validation failure means no top up was completed, so
  // showing a success message or contacting the client would be misleading.
  it('does not email a quotation rejected by the backend', async () => {
    createQuotation.mockRejectedValueOnce(
      Object.assign(new Error('Quotation validation failed.'), { status: 422 })
    )

    await openSilvertreeTopUp()
    enterCredits('100')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Quotation validation failed.')
    expect(screen.getByRole('heading', { name: 'SMS Top Up' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', {
      name: 'SMS credits for Binjai Park (ST-BP-01)',
    })).toBeEnabled()
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).not.toHaveBeenCalled()
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('0')
  })

  // Check that an allocation error stops the workflow before email delivery.
  // A generated quotation is not proof that the credits were added, so an
  // allocation failure must never produce a sent-email confirmation.
  it('does not send email when credit allocation fails', async () => {
    vi.spyOn(allocationService, 'allocate').mockImplementationOnce(() => {
      throw new CreditAllocationError('Invalid outlet allocation.')
    })

    await openSilvertreeTopUp()
    enterCredits('100')
    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid outlet allocation.')
    expect(screen.getByRole('heading', { name: 'SMS Top Up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', {
      name: 'SMS credits for Binjai Park (ST-BP-01)',
    })).toBeEnabled()
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(sendQuotationEmail).not.toHaveBeenCalled()
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('0')
  })

  // Check that repeated clicks during an email retry do not start duplicate
  // deliveries. The first retry is intentionally left pending so we can
  // verify the request is protected until the email service responds.
  it('allows only one email retry at a time', async () => {
    let finishRetry
    sendQuotationEmail
      .mockRejectedValueOnce(new Error('Email could not be sent. Please try again.'))
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishRetry = resolve
      }))

    await openSilvertreeTopUp()
    enterCredits('100')
    await generateQuotation()
    expect(await screen.findByRole('button', { name: 'Retry Email' })).toBeInTheDocument()

    const retryButton = screen.getByRole('button', { name: 'Retry Email' })
    act(() => {
      fireEvent.click(retryButton)
      fireEvent.click(retryButton)
    })

    expect(sendQuotationEmail).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Email delivery status')).toHaveTextContent(
      'Sending quotation to client…'
    )
    expect(screen.queryByRole('button', { name: 'Retry Email' })).not.toBeInTheDocument()
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')

    await act(async () => {
      finishRetry({ status: 'sent' })
    })

    expect(await screen.findByText('Quotation email sent successfully.')).toBeInTheDocument()
    expect(sendQuotationEmail).toHaveBeenCalledTimes(2)
    expect(createQuotation).toHaveBeenCalledTimes(1)
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('100')
  })
})
