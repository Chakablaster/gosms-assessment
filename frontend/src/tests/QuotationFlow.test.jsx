import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { getBusinesses, createQuotation } from '../services/gosmsApi'
import { createQuotationService } from '../../../backend/services/quotationService'
import { brands, companies, outlets } from '../../../backend/data/mockData'

vi.mock('../services/gosmsApi', () => ({
  getBusinesses: vi.fn(),
  createQuotation: vi.fn(),
}))

vi.mock('../services/quotationEmail', () => ({
  sendQuotationEmail: vi.fn().mockResolvedValue({ status: 'sent' }),
}))

async function chooseBrand(brandId) {
  const brand = brands.find((item) => item.id === brandId)
  await screen.findByRole('button', { name: 'Client Brand' })
  fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: brand.name }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

function creditInput(name, code) {
  return screen.getByRole('textbox', { name: `SMS credits for ${name} (${code})` })
}

async function generate() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))
  })
}

function backToTopUp() {
  fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
}

describe('GoSMS quotation workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBusinesses.mockResolvedValue({ brands, companies, outlets })
    const service = createQuotationService({ brands, companies, outlets })

    createQuotation.mockImplementation(async (brandId, creditsByOutlet) =>
      service.generate({ brandId, creditsByOutlet })
    )
  })

  it('blocks generation when no SMS credits are entered', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    await generate()

    expect(screen.getByRole('alert')).toHaveTextContent('Allocate at least 1 SMS credit')
    expect(screen.getByRole('heading', { name: 'SMS Top Up' })).toBeInTheDocument()
    expect(createQuotation).not.toHaveBeenCalled()
  })

  it('blocks generation when any credit input is invalid', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '150' } })
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-02'), { target: { value: '-1' } })
    await generate()

    expect(screen.getByText('Correct the invalid SMS credit amounts before generating a quotation.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'SMS Top Up' })).toBeInTheDocument()
    expect(createQuotation).not.toHaveBeenCalled()
  })

  it('groups allocated outlets by company, omits zero allocations and shows success', async () => {
    render(<App />)
    await chooseBrand('silvertree')

    for (const [code, value] of [['ST-BP-01', '300'], ['ST-BP-02', '200'], ['ST-BP-03', '400']]) {
      fireEvent.change(creditInput('Binjai Park', code), { target: { value } })
    }

    await generate()

    expect(screen.getByRole('heading', { name: 'SMS Credit Quotation' })).toBeInTheDocument()
    expect(screen.getByText('Silvertree Oris Sdn Bhd')).toBeInTheDocument()
    expect(screen.getByText('Silvertree Binjai Sdn Bhd')).toBeInTheDocument()
    expect(screen.queryByText('Silvertree US Sdn Bhd')).not.toBeInTheDocument()
    expect(screen.getByText('900')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Quotation generated successfully.')
    expect(createQuotation).toHaveBeenCalledTimes(1)
  })

  it('returns to fresh editable inputs after generating a quotation', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '250' } })
    await generate()

    const reference = screen.getByText(/^QT-\d+$/).textContent
    expect(screen.queryByRole('button', { name: 'New Top Up' })).not.toBeInTheDocument()

    backToTopUp()

    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('0')
    expect(creditInput('Binjai Park', 'ST-BP-01')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: 'Generate Quotation' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New Top Up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByText(reference)).toBeInTheDocument()
  })

  it('generates separate quotations on consecutive top ups and preserves history', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '250' } })
    await generate()

    const firstReference = screen.getByText(/^QT-\d+$/).textContent
    backToTopUp()
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '100' } })
    await generate()

    const secondReference = screen.getByText(/^QT-\d+$/).textContent
    expect(secondReference).not.toBe(firstReference)

    backToTopUp()
    fireEvent.click(screen.getByRole('button', { name: 'History' }))

    expect(screen.getByText(firstReference)).toBeInTheDocument()
    expect(screen.getByText(secondReference)).toBeInTheDocument()
    expect(screen.queryByText(/Revised/)).not.toBeInTheDocument()
  })

  it('shows per-outlet current credits and keeps new top up credits separate', async () => {
    render(<App />)
    await chooseBrand('gordon-grill')
    fireEvent.change(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01'), { target: { value: '8' } })
    await generate()
    backToTopUp()

    const pavilionRow = creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01').closest('tr')
    expect(within(pavilionRow).getByText('8')).toBeInTheDocument()
    expect(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01')).toHaveValue('0')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')

    fireEvent.change(creditInput('Mid Valley Megamall', 'GG-MV-02'), { target: { value: '4' } })
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('4')

    await generate()
    backToTopUp()

    expect(within(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01').closest('tr')).getByText('8')).toBeInTheDocument()
    expect(within(creditInput('Mid Valley Megamall', 'GG-MV-02').closest('tr')).getByText('4')).toBeInTheDocument()
  })

  it('allows opening history without resetting an unfinished top up', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '250' } })
    await generate()
    backToTopUp()

    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    expect(screen.getByRole('button', { name: 'Back to History' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New Top Up' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to History' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to SMS Top Up' }))
    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('75')
  })

  it('keeps brand histories and unfinished top ups independent', async () => {
    render(<App />)
    await chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '250' } })
    await generate()
    backToTopUp()

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('gordon-grill')
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument()

    fireEvent.change(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('silvertree')

    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('0')
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    await chooseBrand('gordon-grill')
    expect(creditInput('Pavilion Kuala Lumpur', 'GG-PAV-01')).toHaveValue('50')
  })

  it('keeps the draft editable when the backend rejects generation', async () => {
    createQuotation.mockRejectedValueOnce(new Error('GoSMS server unavailable.'))

    render(<App />)
    await chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '250' } })
    await generate()

    expect(screen.getByRole('alert')).toHaveTextContent('GoSMS server unavailable.')
    expect(screen.getByRole('heading', { name: 'SMS Top Up' })).toBeInTheDocument()
    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('250')
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument()
  })

  it('prevents duplicate generation requests while the backend is processing', async () => {
    let rejectRequest

    createQuotation.mockImplementationOnce(() => new Promise((resolve, reject) => {
      rejectRequest = reject
    }))

    render(<App />)
    await chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '250' } })

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    const pendingButton = screen.getByRole('button', { name: 'Generating Quotation...' })
    expect(pendingButton).toBeDisabled()

    fireEvent.click(pendingButton)
    expect(createQuotation).toHaveBeenCalledTimes(1)

    await act(async () => {
      rejectRequest(new Error('Request failed.'))
    })

    expect(screen.getByRole('button', { name: 'Generate Quotation' })).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Request failed.')
  })
})
