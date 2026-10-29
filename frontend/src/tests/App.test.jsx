
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { getBusinesses, getCreditBalances, getQuotationHistory } from '../services/gosmsApi'
import { brands, companies, outlets } from '../../../backend/data/mockData'

vi.mock('../services/gosmsApi', () => ({
  getBusinesses: vi.fn(),
  getCreditBalances: vi.fn(),
  getQuotationHistory: vi.fn(),
  createQuotation: vi.fn(),
}))

async function chooseBrand(brandId, brandName = brands.find((brand) => brand.id === brandId)?.name) {
  const trigger = await screen.findByRole('button', { name: 'Client Brand' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('option', { name: brandName }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByRole('heading', { name: 'SMS Top Up' })
}

function creditInput(outletName, code) {
  return screen.getByRole('textbox', { name: `SMS credits for ${outletName} (${code})` })
}

function enterCredits(outletName, code, value) {
  fireEvent.change(creditInput(outletName, code), { target: { value } })
}

describe('GoSMS credit reload application', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getBusinesses.mockResolvedValue({ brands, companies, outlets })
    getCreditBalances.mockResolvedValue({ companyBalances: {}, outletBalances: {} })
    getQuotationHistory.mockResolvedValue([])
  })

  // Check that the application stays on its loading screen until both business
  // records and credit balances arrive. The user must not be allowed to choose
  // a brand from incomplete data or mistake an unknown balance for zero.
  it('waits for both initial requests before showing the brand selector', async () => {
    let resolveBusinesses
    let resolveBalances
    getBusinesses.mockImplementationOnce(() => new Promise((resolve) => { resolveBusinesses = resolve }))
    getCreditBalances.mockImplementationOnce(() => new Promise((resolve) => { resolveBalances = resolve }))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading businesses...')
    expect(screen.queryByRole('heading', { name: 'Choose Business' })).not.toBeInTheDocument()

    await act(async () => {
      resolveBusinesses({ brands, companies, outlets })
    })

    expect(screen.getByRole('status')).toHaveTextContent('Loading businesses...')

    await act(async () => {
      resolveBalances({ companyBalances: {}, outletBalances: {} })
    })

    expect(screen.getByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    expect(screen.queryByText('Loading businesses...')).not.toBeInTheDocument()
  })

  // Check that a fresh visit opens brand selection without choosing anything
  // on the user's behalf. Continue must remain disabled until a brand has been
  // selected, so the top up screen cannot open without a valid business.
  it('starts on business selection with Continue disabled', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client Brand' })).toHaveTextContent('Select a brand')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'SMS Top Up' })).not.toBeInTheDocument()
    expect(getBusinesses).toHaveBeenCalledOnce()
    expect(getCreditBalances).toHaveBeenCalledOnce()
  })

  // Check that each outlet is shown with the right code and company, even when
  // several outlets have the same display name. The user needs these details
  // to allocate credits to the intended outlet rather than a similarly named one.
  it('shows the selected brand’s outlets with their correct codes and companies', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    const expectedOutlets = [
      ['Binjai Park', 'ST-BP-01', 'Silvertree Oris Sdn Bhd'],
      ['Binjai Park', 'ST-BP-02', 'Silvertree Oris Sdn Bhd'],
      ['Binjai Park', 'ST-BP-03', 'Silvertree Binjai Sdn Bhd'],
      ['Union Square', 'ST-US-01', 'Silvertree US Sdn Bhd'],
    ]

    for (const [name, code, company] of expectedOutlets) {
      const input = creditInput(name, code)
      const row = input.closest('tr')
      expect(within(row).getByText(name)).toBeInTheDocument()
      expect(within(row).getByText(code)).toBeInTheDocument()
      expect(within(row).getByText(company)).toBeInTheDocument()
      expect(input).toHaveValue('0')
    }

    expect(screen.getByRole('columnheader', { name: 'Current Credits' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Top Up Credits' })).toBeInTheDocument()
    expect(screen.queryByText('Pavilion Kuala Lumpur')).not.toBeInTheDocument()
  })

  // Check that the current balance comes from the backend while a new top up
  // starts at zero. A previously allocated balance must not be treated as an
  // amount the user is about to purchase, and History remains accessible.
  it('shows existing backend credits separately from new top up inputs', async () => {
    getCreditBalances.mockResolvedValueOnce({
      companyBalances: { 'silvertree-oris': '50' },
      outletBalances: { 'st-001': '50' },
    })

    render(<App />)
    await chooseBrand('silvertree')

    const input = creditInput('Binjai Park', 'ST-BP-01')
    expect(within(input.closest('tr')).getByText('50')).toBeInTheDocument()
    expect(input).toHaveValue('0')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    expect(getQuotationHistory).not.toHaveBeenCalled()
  })

  // Check that the displayed total changes as the user enters or revises
  // amounts across different outlets. It must include every valid top up,
  // omit zero allocations, and recalculate when an existing entry changes.
  it('updates the total as credits are entered and changed', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    enterCredits('Binjai Park', 'ST-BP-01', '300')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('300')

    enterCredits('Binjai Park', 'ST-BP-02', '300')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('600')

    enterCredits('Binjai Park', 'ST-BP-03', '300')
    enterCredits('Union Square', 'ST-US-01', '0')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('900')

    enterCredits('Binjai Park', 'ST-BP-02', '200')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('800')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Check that invalid credit values produce an inline error on the affected
  // input, not just an unexplained total. The error must be associated with
  // its field so users can tell which outlet needs correction.
  it('shows an accessible inline error for invalid credit amounts', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    const input = creditInput('Binjai Park', 'ST-BP-01')

    for (const value of ['-1', '1.5', 'abc']) {
      fireEvent.change(input, { target: { value } })
      expect(input).toHaveValue(value)
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAttribute('aria-describedby', 'credits-st-001-error')
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number of SMS credits (0 or more).')
    }
  })

  // Check that invalid values are excluded from the total until corrected,
  // while other valid entries remain counted. Fixing the invalid amount must
  // clear its error and immediately include the corrected credits in the total.
  it('excludes invalid amounts and restores them to the total once corrected', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    enterCredits('Binjai Park', 'ST-BP-01', '300')
    const secondInput = creditInput('Binjai Park', 'ST-BP-02')
    fireEvent.change(secondInput, { target: { value: 'bad' } })

    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('300')
    expect(secondInput).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(secondInput, { target: { value: '200' } })

    expect(secondInput).toHaveValue('200')
    expect(secondInput).toHaveAttribute('aria-invalid', 'false')
    expect(secondInput).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('500')
  })

  // Check that clearing a previously entered amount is allowed and reduces
  // the total to zero. Leaving an outlet blank means no top up for that outlet;
  // it must not force the user to type a zero or trigger an error.
  it('treats an empty credit input as zero without reporting an error', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    const input = creditInput('Binjai Park', 'ST-BP-01')

    fireEvent.change(input, { target: { value: '250' } })
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('250')
    fireEvent.change(input, { target: { value: '' } })

    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
  })

  // Check that an amount above JavaScript's safe integer limit gets the specific
  // size error and contributes nothing to the total. The interface must not
  // silently round an amount that could become an incorrect allocation.
  it('reports an oversized credit amount without adding it to the total', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    const input = creditInput('Binjai Park', 'ST-BP-01')
    const tooLarge = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString()

    fireEvent.change(input, { target: { value: tooLarge } })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('The credit amount is too large.')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
  })

  // Check that switching brands preserves each unfinished draft independently.
  // An amount entered for one brand must not leak into another brand's total,
  // and returning to either brand must restore exactly what was entered there.
  it('restores independent unfinished top ups when switching brands', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    enterCredits('Binjai Park', 'ST-BP-01', '300')

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('gordon-grill')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
    enterCredits('Pavilion Kuala Lumpur', 'GG-PAV-01', '75')

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('silvertree')
    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('300')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('300')

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('gordon-grill')
    expect(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01')).toHaveValue('75')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('75')
  })

  // Check that a failure to load business records replaces the selector with
  // an error and a working Retry button. After the request succeeds, the user
  // must regain a usable business selection screen rather than a stale error.
  it('recovers the business selection screen after a business request fails', async () => {
    getBusinesses.mockRejectedValueOnce(new Error('Unable to connect to the GoSMS server.'))
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect to the GoSMS server.')
    expect(screen.queryByRole('heading', { name: 'Choose Business' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getBusinesses).toHaveBeenCalledTimes(2)
    expect(getCreditBalances).toHaveBeenCalledTimes(2)
  })

  // Check that a failed initial balance request does not let the app display
  // missing balances as zeros. Retrying must load both datasets successfully
  // before the user can enter amounts on the top up screen.
  it('recovers from an initial balance request failure without showing false zeros', async () => {
    getCreditBalances.mockRejectedValueOnce(new Error('Unable to load credit balances.'))
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load credit balances.')
    expect(screen.queryByRole('heading', { name: 'Choose Business' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    await chooseBrand('silvertree')

    expect(within(creditInput('Binjai Park', 'ST-BP-01').closest('tr')).getByText('0')).toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
    expect(getCreditBalances).toHaveBeenCalledTimes(2)
    expect(getBusinesses).toHaveBeenCalledTimes(2)
  })

  // Check that a brand with no configured outlets shows the intended empty
  // state rather than an empty table or a quotation action. A missing outlet
  // list should not let someone submit a top up without anywhere to allocate it.
  it('explains when the selected brand has no configured outlets', async () => {
    const emptyBrand = { id: 'no-outlets', name: 'Unassigned Brand' }
    getBusinesses.mockResolvedValueOnce({ brands: [...brands, emptyBrand], companies, outlets })

    render(<App />)
    await chooseBrand(emptyBrand.id, emptyBrand.name)

    expect(screen.getByText('No outlets are configured for this brand.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate Quotation' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change Brand' })).toBeInTheDocument()
  })
})
