
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { getBusinesses, getCreditBalances } from '../services/gosmsApi'
import { brands, companies, outlets } from '../../../backend/data/mockData'

vi.mock('../services/gosmsApi', () => ({
  getBusinesses: vi.fn(),
  getCreditBalances: vi.fn(),
  createQuotation: vi.fn(),
}))

async function chooseBrand(brandId) {
  const brand = brands.find((item) => item.id === brandId)
  await screen.findByRole('button', { name: 'Client Brand' })
  fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: brand.name }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

function creditInput(outletName, code) {
  return screen.getByRole('textbox', {
    name: `SMS credits for ${outletName} (${code})`,
  })
}

describe('GoSMS credit reload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBusinesses.mockResolvedValue({ brands, companies, outlets })
    getCreditBalances.mockResolvedValue({ companyBalances: {}, outletBalances: {} })
  })

  it('starts on the business selection screen', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client Brand' })).toHaveTextContent('Select a brand')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'SMS Top Up' })).not.toBeInTheDocument()
    expect(getBusinesses).toHaveBeenCalledOnce()
    expect(getCreditBalances).toHaveBeenCalledOnce()
  })

  it('shows all selected outlets with distinct codes and companies', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    expect(screen.getAllByText('Binjai Park')).toHaveLength(3)
    expect(screen.getByText('Union Square')).toBeInTheDocument()
    expect(screen.getByText('ST-BP-01')).toBeInTheDocument()
    expect(screen.getByText('ST-BP-02')).toBeInTheDocument()
    expect(screen.getByText('ST-BP-03')).toBeInTheDocument()
    expect(screen.getAllByText('Silvertree Oris Sdn Bhd')).toHaveLength(2)
    expect(screen.getByText('Silvertree Binjai Sdn Bhd')).toBeInTheDocument()
    expect(screen.getByText('Silvertree US Sdn Bhd')).toBeInTheDocument()
    expect(screen.getByText('Current Credits')).toBeInTheDocument()
    expect(screen.getByText('Top Up Credits')).toBeInTheDocument()
  })

  it('displays backend balances without needing quotation history', async () => {
    getCreditBalances.mockResolvedValueOnce({
      companyBalances: { 'silvertree-oris': '50' },
      outletBalances: { 'st-001': '50' },
    })

    render(<App />)
    await chooseBrand('silvertree')

    const row = creditInput('Binjai Park', 'ST-BP-01').closest('tr')
    expect(within(row).getByText('50')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument()
  })

  it('calculates the prototype allocations as 900 credits', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    for (const [name, code, value] of [
      ['Binjai Park', 'ST-BP-01', '300'],
      ['Binjai Park', 'ST-BP-02', '300'],
      ['Binjai Park', 'ST-BP-03', '300'],
      ['Union Square', 'ST-US-01', '0'],
    ]) {
      fireEvent.change(creditInput(name, code), { target: { value } })
    }

    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('900')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('displays inline errors for invalid inputs', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    const input = creditInput('Binjai Park', 'ST-BP-01')

    for (const value of ['-1', '1.5', 'abc']) {
      fireEvent.change(input, { target: { value } })
      expect(input).toHaveValue(value)
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number of SMS credits (0 or more).')
    }
  })

  it('excludes invalid inputs from the total until corrected', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '300' } })
    const second = creditInput('Binjai Park', 'ST-BP-02')
    fireEvent.change(second, { target: { value: 'bad' } })

    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('300')
    fireEvent.change(second, { target: { value: '200' } })

    expect(second).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('500')
  })

  it('accepts an empty input as zero without an error', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    const input = creditInput('Binjai Park', 'ST-BP-01')
    fireEvent.change(input, { target: { value: '250' } })
    fireEvent.change(input, { target: { value: '' } })

    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
  })

  it('shows a distinct error for credit amounts beyond the safe integer range', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), {
      target: { value: '9007199254740992' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('The credit amount is too large.')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
  })

  it('does not offer an action to reset credit inputs', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    expect(screen.queryByRole('button', { name: 'Reset Credits' })).not.toBeInTheDocument()
  })

  it('retains unfinished credits independently when changing brands', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('gordon-grill')

    expect(screen.getByText('Pavilion Kuala Lumpur')).toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('silvertree')

    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('300')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('300')
  })

  it('shows a retry option when business data cannot be loaded', async () => {
    getBusinesses.mockRejectedValueOnce(new Error('Unable to connect to the GoSMS server.'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to connect to the GoSMS server.')
    expect(screen.queryByRole('heading', { name: 'Choose Business' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    expect(getBusinesses).toHaveBeenCalledTimes(2)
  })

  it('does not show zero balances when the backend balance request fails', async () => {
    getCreditBalances.mockRejectedValueOnce(new Error('Unable to load credit balances.'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load credit balances.')
    expect(screen.queryByRole('heading', { name: 'Choose Business' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    expect(getCreditBalances).toHaveBeenCalledTimes(2)
  })
})
