import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { brands } from '../data/mockData'

function chooseBrand(brandId) {
  const brand = brands.find((item) => item.id === brandId)
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
  it('starts on the business selection screen', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Choose Business' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client Brand' })).toHaveTextContent('Select a brand')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'SMS Top Up' })).not.toBeInTheDocument()
  })

  it('shows all selected outlets with distinct codes and companies', () => {
    render(<App />)
    chooseBrand('silvertree')

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

  it('calculates the prototype allocations as 900 credits', () => {
    render(<App />)
    chooseBrand('silvertree')

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

  it('displays inline errors for invalid inputs', () => {
    render(<App />)
    chooseBrand('silvertree')
    const input = creditInput('Binjai Park', 'ST-BP-01')

    for (const value of ['-1', '1.5', 'abc']) {
      fireEvent.change(input, { target: { value } })
      expect(input).toHaveValue(value)
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number of SMS credits (0 or more).')
    }
  })

  it('excludes invalid inputs from the total until corrected', () => {
    render(<App />)
    chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '300' } })
    const second = creditInput('Binjai Park', 'ST-BP-02')
    fireEvent.change(second, { target: { value: 'bad' } })
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('300')
    fireEvent.change(second, { target: { value: '200' } })
    expect(second).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('500')
  })

  it('accepts an empty input as zero without an error', () => {
    render(<App />)
    chooseBrand('silvertree')
    const input = creditInput('Binjai Park', 'ST-BP-01')
    fireEvent.change(input, { target: { value: '250' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
  })

  it('shows a distinct error for credit amounts beyond the safe integer range', () => {
    render(<App />)
    chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '9007199254740992' } })
    expect(screen.getByRole('alert')).toHaveTextContent('The credit amount is too large.')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
  })

  it('does not offer an action to reset credit inputs', () => {
    render(<App />)
    chooseBrand('silvertree')
    expect(screen.queryByRole('button', { name: 'Reset Credits' })).not.toBeInTheDocument()
  })

  it('retains unfinished credits independently when changing brands', () => {
    render(<App />)
    chooseBrand('silvertree')
    fireEvent.change(creditInput('Binjai Park', 'ST-BP-01'), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    chooseBrand('gordon-grill')
    expect(screen.getByText('Pavilion Kuala Lumpur')).toBeInTheDocument()
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('0')
    fireEvent.click(screen.getByRole('button', { name: 'Change Brand' }))
    chooseBrand('silvertree')
    expect(creditInput('Binjai Park', 'ST-BP-01')).toHaveValue('300')
    expect(screen.getByLabelText('Total SMS Credits')).toHaveTextContent('300')
  })
})
