import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { getBusinesses, getCreditBalances, getQuotationHistory, createQuotation } from '../services/gosmsApi'
import { sendQuotationEmail } from '../services/quotationEmail'
import { createQuotationService } from '../../../backend/services/quotationService'
import { createCreditAllocationService } from '../../../backend/services/creditAllocationService'
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

async function chooseBrand(brandId) {
  const brand = brands.find((item) => item.id === brandId)

  fireEvent.click(await screen.findByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: brand.name }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  await screen.findByRole('heading', { name: 'SMS Top Up' })
}

function creditInput(name, code) {
  return screen.getByRole('textbox', { name: `SMS credits for ${name} (${code})` })
}

function enterCredits(name, code, amount) {
  fireEvent.change(creditInput(name, code), { target: { value: amount } })
}

async function generateQuotation() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))
  await screen.findByRole('heading', { name: 'SMS Credit Quotation' })
}

function backToTopUp() {
  fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
}

async function openHistory() {
  fireEvent.click(screen.getByRole('button', { name: 'History' }))
  await screen.findByRole('heading', { name: 'History' })
}

describe('SMS credit quotation workflow', () => {
  let quotationService
  let allocationService
  let savedHistory

  beforeEach(() => {
    vi.clearAllMocks()
    quotationService = createQuotationService({ brands, companies, outlets })
    allocationService = createCreditAllocationService({ companies, outlets })
    savedHistory = new Map()

    // Use the real backend quotation and allocation rules while mocking the API boundary.
    // This keeps the UI tests tied to actual credit balances without starting a server.
    getBusinesses.mockResolvedValue({ brands, companies, outlets })
    getCreditBalances.mockImplementation(async () => allocationService.getBalances())
    sendQuotationEmail.mockResolvedValue({ status: 'sent' })

    // History is fetched from the backend when the user opens it. Returning only
    // the current session's React state would hide failures in the history flow.
    getQuotationHistory.mockImplementation(async (brandId) => [...(savedHistory.get(brandId) ?? [])])

    createQuotation.mockImplementation(async (brandId, creditsByOutlet, operationId) => {
      const quotation = quotationService.generate({ brandId, creditsByOutlet })
      allocationService.allocate(quotation)

      const request = { id: operationId, brandId, status: 'generated', quotation }
      savedHistory.set(brandId, [request, ...(savedHistory.get(brandId) ?? [])])
      return quotation
    })
  })

  // Check that an empty top up cannot produce a quotation or contact the backend.
  // A quotation requires at least one allocated credit, so an untouched form
  // must remain editable and explain why generation was blocked.
  it('does not submit a quotation when no credits have been entered', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Allocate at least 1 SMS credit')
    expect(screen.getByRole('heading', { name: 'SMS Top Up' })).toBeInTheDocument()
    expect(createQuotation).not.toHaveBeenCalled()
    expect(sendQuotationEmail).not.toHaveBeenCalled()
  })

  // Check that one invalid outlet amount blocks the entire quotation, even
  // when another outlet has a valid amount. A partial submission would allocate
  // credits differently from what the user entered on the form.
  it('blocks the whole quotation if any outlet has an invalid amount', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '150')
    enterCredits('Binjai Park', 'ST-BP-02', '-1')

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(screen.getByText('Correct the invalid SMS credit amounts before generating a quotation.')).toBeInTheDocument()
    expect(creditInput('Binjai Park', 'ST-BP-02')).toHaveAttribute('aria-invalid', 'true')
    expect(createQuotation).not.toHaveBeenCalled()
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('0')
  })

  // Check that allocated outlets appear under their correct companies, with
  // individual amounts and company totals. Outlets receiving zero credits
  // should be omitted so the quotation contains only actual allocations.
  it('groups allocated outlets by company and leaves zero-credit outlets out', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '300')
    enterCredits('Binjai Park', 'ST-BP-02', '200')
    enterCredits('Binjai Park', 'ST-BP-03', '400')

    await generateQuotation()

    expect(screen.getByRole('heading', { name: 'SMS Credit Quotation' })).toBeInTheDocument()

    const oris = screen.getByRole('region', { name: 'Silvertree Oris Sdn Bhd' })
    const binjai = screen.getByRole('region', { name: 'Silvertree Binjai Sdn Bhd' })

    expect(within(oris).getByText('ST-BP-01')).toBeInTheDocument()
    expect(within(oris).getByText('ST-BP-02')).toBeInTheDocument()
    expect(within(oris).getByText('500')).toBeInTheDocument()

    // The Binjai company displays 400 twice: once for the outlet allocation
    // and once for its company total. Verify both rows separately instead of
    // assuming the amount occurs only once within the company section.
    const binjaiOutletRow = within(binjai).getByText('ST-BP-03').closest('tr')
    const binjaiTotalRow = within(binjai).getByText('Company Total').closest('tr')

    expect(within(binjaiOutletRow).getByText('400')).toBeInTheDocument()
    expect(within(binjaiTotalRow).getByText('400')).toBeInTheDocument()

    expect(screen.queryByRole('region', { name: 'Silvertree US Sdn Bhd' })).not.toBeInTheDocument()
    expect(screen.getByText('900')).toBeInTheDocument()
    expect(createQuotation).toHaveBeenCalledTimes(1)

    expect(await screen.findByText(
      'Quotation generated and emailed successfully. SMS credits have been allocated.'
    )).toBeInTheDocument()

    backToTopUp()

    // The backend balance refresh must reflect each allocated amount in the
    // correct outlet row, not just report the overall quotation total.
    await waitFor(() => {
      expect(within(creditInput('Binjai Park', 'ST-BP-01').closest('tr')).getByText('300')).toBeInTheDocument()
      expect(within(creditInput('Binjai Park', 'ST-BP-02').closest('tr')).getByText('200')).toBeInTheDocument()
      expect(within(creditInput('Binjai Park', 'ST-BP-03').closest('tr')).getByText('400')).toBeInTheDocument()
    })
  })

  // Check that returning from a completed quotation opens fresh editable
  // inputs without removing the saved quotation. Completed allocations must
  // remain in history rather than being editable as part of a new top up.
  it('returns to fresh editable inputs while keeping the generated quotation', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '250')
    await generateQuotation()

    const reference = screen.getByText(/^QT-\d+$/).textContent
    backToTopUp()

    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('0')
    expect(creditInput('Binjai Park', 'ST-BP-01')).toBeEnabled()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: 'Generate Quotation' })).toBeEnabled()

    await openHistory()
    expect(await screen.findByText(reference)).toBeInTheDocument()
    expect(getQuotationHistory).toHaveBeenCalledWith('silvertree')
  })

  // Check that consecutive top ups create independent quotation records and
  // accumulate credits without replacing earlier history. The newest record
  // should appear first while both references remain available.
  it('keeps separate quotations in history, with the newest first', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '250')
    await generateQuotation()
    const firstReference = screen.getByText(/^QT-\d+$/).textContent

    backToTopUp()
    enterCredits('Binjai Park', 'ST-BP-01', '100')
    await generateQuotation()
    const secondReference = screen.getByText(/^QT-\d+$/).textContent

    expect(secondReference).not.toBe(firstReference)
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('350')

    backToTopUp()
    await openHistory()
    await waitFor(() => expect(screen.getByLabelText('Generated Quotations')).toHaveTextContent('2'))

    expect(screen.getAllByText(/^QT-\d+$/).map((item) => item.textContent)).toEqual([
      secondReference,
      firstReference,
    ])
    expect(screen.getByLabelText('Quoted SMS Credits')).toHaveTextContent('350')
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)
  })

  // Check that previously allocated credits stay separate from the amount
  // being entered for the next top up. Existing balances are informational
  // and must not be included again in the next quotation's total.
  it('keeps existing outlet credits separate from the next top up amount', async () => {
    render(<App />)
    await chooseBrand('gordon-grill')
    enterCredits('Pavilion Kuala Lumpur', 'GG-PAV-01', '8')
    await generateQuotation()
    backToTopUp()

    await waitFor(() => {
      expect(within(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01').closest('tr')).getByText('8')).toBeInTheDocument()
    })

    expect(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01')).toHaveValue('0')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')

    enterCredits('Mid Valley Megamall', 'GG-MV-02', '4')

    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('4')
    await generateQuotation()
    backToTopUp()

    await waitFor(() => {
      expect(within(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01').closest('tr')).getByText('8')).toBeInTheDocument()
      expect(within(creditInput('Mid Valley Megamall', 'GG-MV-02').closest('tr')).getByText('4')).toBeInTheDocument()
    })

    expect(allocationService.getBalances().companyBalances['gordon-dining']).toBe('12')
  })

  // Check that credits allocated before the current browser session are still
  // displayed. Current balances come from the backend and must not depend on
  // the user having generated a quotation in this session.
  it('shows credits already held by the backend without a quotation from this session', async () => {
    const existing = quotationService.generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '120' },
    })

    allocationService.allocate(existing)

    render(<App />)
    await chooseBrand('silvertree')

    expect(within(creditInput('Binjai Park', 'ST-BP-01').closest('tr')).getByText('120')).toBeInTheDocument()
    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('0')

    await openHistory()
    expect(await screen.findByRole('heading', { name: 'No quotations yet' })).toBeInTheDocument()
  })

  // Check that a failed balance refresh does not leave an outdated balance
  // visible after a successful allocation. The interface should show an
  // unavailable value rather than implying that no credits were added.
  it('hides stale balances if refreshing credits after generation fails', async () => {
    getCreditBalances
      .mockImplementationOnce(async () => allocationService.getBalances())
      .mockRejectedValueOnce(new Error('Connection failed.'))

    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '250')
    await generateQuotation()
    backToTopUp()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Current credit balances could not be refreshed.'
    )

    expect(within(creditInput('Binjai Park', 'ST-BP-01').closest('tr')).getByText('—')).toBeInTheDocument()
    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('0')
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('250')
  })

  // Check that navigating through quotation history does not discard an
  // unfinished top up. Viewing an existing quotation must be read-only and
  // must not accidentally generate a second quotation.
  it('preserves an unfinished top up while the user views quotation history', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '250')
    await generateQuotation()
    backToTopUp()

    enterCredits('Binjai Park', 'ST-BP-01', '75')
    await openHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'View' }))

    expect(screen.getByRole('button', { name: 'Back to History' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to History' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))

    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('75')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('75')
    expect(createQuotation).toHaveBeenCalledTimes(1)
  })

  // Check that a saved quotation for one brand does not appear in another
  // brand's history, and that each brand retains its own unfinished inputs.
  // Switching businesses must not mix financial records or draft allocations.
  it('keeps brand histories and unfinished top ups independent', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '250')
    await generateQuotation()
    backToTopUp()

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('gordon-grill')
    await openHistory()

    expect(await screen.findByRole('heading', { name: 'No quotations yet' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
    enterCredits('Pavilion Kuala Lumpur', 'GG-PAV-01', '50')

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('silvertree')

    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('0')
    await openHistory()
    expect(await screen.findByText(/^QT-\d+$/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('gordon-grill')

    expect(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01')).toHaveValue('50')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('50')
  })

  // Check that a known backend validation rejection leaves the draft editable
  // without recording any allocation. The user should be able to correct the
  // rejected request instead of being forced into uncertain-request recovery.
  it('keeps the draft editable after the backend rejects a quotation', async () => {
    createQuotation.mockRejectedValueOnce(
      Object.assign(new Error('Quotation validation failed.'), { status: 422 })
    )

    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '250')

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Quotation validation failed.')
    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('250')
    expect(creditInput('Binjai Park', 'ST-BP-01')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Generate Quotation' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('0')
    expect(sendQuotationEmail).not.toHaveBeenCalled()
  })

  // Check that an in-progress quotation cannot be submitted twice, and that
  // an uncertain network failure keeps the draft locked for recovery. A retry
  // must reuse the original operation ID instead of risking a second allocation.
  it('blocks duplicate submissions while pending and protects an uncertain operation', async () => {
    let rejectFirstRequest

    createQuotation.mockImplementationOnce(() => new Promise((resolve, reject) => {
      rejectFirstRequest = reject
    }))

    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '250')

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    const pendingButton = screen.getByRole('button', { name: 'Generating Quotation...' })

    expect(pendingButton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Change Brand' })).toBeDisabled()

    fireEvent.click(pendingButton)
    expect(createQuotation).toHaveBeenCalledTimes(1)

    await act(async () => {
      rejectFirstRequest(new Error('Network connection interrupted.'))
    })

    expect(screen.getByRole('button', { name: 'Retry Quotation' })).toBeEnabled()
    expect(creditInput('Binjai Park', 'ST-BP-01')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Change Brand' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Network connection interrupted.')

    const originalOperationId = createQuotation.mock.calls[0][2]

    fireEvent.click(screen.getByRole('button', { name: 'Retry Quotation' }))
    await screen.findByRole('heading', { name: 'SMS Credit Quotation' })

    expect(createQuotation).toHaveBeenCalledTimes(2)
    expect(createQuotation.mock.calls[1][2]).toBe(originalOperationId)
    expect(allocationService.getBalances().outletBalances['st-001']).toBe('250')
  })

  // Check that the user can retry a failed history request without losing
  // quotations generated during the current session. The fallback records
  // should remain visible while the backend history is temporarily unavailable.
  it('lets the user retry loading history after a server error', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '100')
    await generateQuotation()

    const reference = screen.getByText(/^QT-\d+$/).textContent
    backToTopUp()

    getQuotationHistory.mockRejectedValueOnce(new Error('History is temporarily unavailable.'))
    await openHistory()

    expect(await screen.findByRole('alert')).toHaveTextContent('History is temporarily unavailable.')
    expect(screen.getByText(reference)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry History' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Retry History' })).not.toBeInTheDocument()
    })

    expect(getQuotationHistory).toHaveBeenCalledTimes(2)
    expect(screen.getByText(reference)).toBeInTheDocument()
  })

  // Check that a quotation saved by the backend can be viewed even when it
  // was not generated in the current browser session. Opening an existing
  // record must not trigger email delivery or generate a fresh quotation.
  it('opens a quotation retrieved from backend history without a local request', async () => {
    const existing = quotationService.generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '120' },
    })

    allocationService.allocate(existing)

    savedHistory.set('silvertree', [{
      id: 'saved-silvertree-quotation',
      brandId: 'silvertree',
      status: 'generated',
      quotation: existing,
    }])

    render(<App />)
    await chooseBrand('silvertree')
    await openHistory()

    expect(await screen.findByText(existing.reference)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    expect(screen.getByRole('heading', { name: 'SMS Credit Quotation' })).toBeInTheDocument()
    expect(screen.getByText(existing.reference)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to History' })).toBeInTheDocument()
    expect(sendQuotationEmail).not.toHaveBeenCalled()
  })
})
