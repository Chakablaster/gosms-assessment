
import { describe, expect, it } from 'vitest'
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react'

import App from './App'

function chooseBrand(brandId) {
  fireEvent.change(
    screen.getByRole('combobox', {
      name: 'Client Brand',
    }),
    { target: { value: brandId } }
  )

  fireEvent.click(
    screen.getByRole('button', { name: 'Continue' })
  )
}

describe('GoSMS credit reload foundation', () => {
  it('starts on the business selection screen', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: 'Choose Business',
      })
    ).toBeInTheDocument()

    expect(screen.getAllByRole('option')).toHaveLength(7)

    expect(
      screen.getByRole('button', {
        name: 'Continue',
      })
    ).toBeDisabled()

    expect(
      screen.queryByRole('heading', {
        name: 'SMS Top Up',
      })
    ).not.toBeInTheDocument()
  })

  it('shows outlets, distinct codes, and companies for the selected brand', () => {
    render(<App />)
    chooseBrand('silvertree')

    expect(
      screen.getByRole('heading', {
        name: 'SMS Top Up',
      })
    ).toBeInTheDocument()

    expect(
      screen.getAllByText('Binjai Park')
    ).toHaveLength(3)

    expect(
      screen.getByText('Union Square')
    ).toBeInTheDocument()

    expect(
      screen.getByText('ST-BP-01')
    ).toBeInTheDocument()

    expect(
      screen.getByText('ST-BP-02')
    ).toBeInTheDocument()

    expect(
      screen.getByText('ST-BP-03')
    ).toBeInTheDocument()

    expect(
      screen.getAllByText('Silvertree Oris Sdn Bhd')
    ).toHaveLength(2)

    expect(
      screen.getByText('Silvertree Binjai Sdn Bhd')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Silvertree US Sdn Bhd')
    ).toBeInTheDocument()
  })

  it('calculates the prototype example as 900 credits', () => {
    render(<App />)
    chooseBrand('silvertree')

    const amounts = [
      ['ST-BP-01', '300'],
      ['ST-BP-02', '300'],
      ['ST-BP-03', '300'],
      ['ST-US-01', '0'],
    ]

    for (const [code, amount] of amounts) {
      const outletName = code.startsWith('ST-US')
        ? 'Union Square'
        : 'Binjai Park'

      fireEvent.change(
        screen.getByRole('textbox', {
          name: `SMS credits for ${outletName} (${code})`,
        }),
        { target: { value: amount } }
      )
    }

    expect(
      screen.getByLabelText('Total SMS Credits')
    ).toHaveTextContent('900')
  })

  it('prevents negative and fractional credits', () => {
    render(<App />)
    chooseBrand('silvertree')

    const input = screen.getByRole('textbox', {
      name: 'SMS credits for Binjai Park (ST-BP-01)',
    })

    fireEvent.change(input, {
      target: { value: '25' },
    })

    fireEvent.change(input, {
      target: { value: '-2' },
    })

    expect(input).toHaveValue('25')

    fireEvent.change(input, {
      target: { value: '1.5' },
    })

    expect(input).toHaveValue('25')
  })

  it('resets entered credits', () => {
    render(<App />)
    chooseBrand('silvertree')

    const input = screen.getByRole('textbox', {
      name: 'SMS credits for Binjai Park (ST-BP-01)',
    })

    fireEvent.change(input, {
      target: { value: '125' },
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reset Credits',
      })
    )

    expect(input).toHaveValue('0')

    expect(
      screen.getByLabelText('Total SMS Credits')
    ).toHaveTextContent('0')
  })

  it('allows changing brands and clears previous amounts', () => {
    render(<App />)
    chooseBrand('silvertree')

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'SMS credits for Binjai Park (ST-BP-01)',
      }),
      { target: { value: '300' } }
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Change Brand',
      })
    )

    chooseBrand('gordon-grill')

    expect(
      screen.getByText('Pavilion Kuala Lumpur')
    ).toBeInTheDocument()

    expect(
      screen.getByText('Mid Valley Megamall')
    ).toBeInTheDocument()

    expect(
      screen.queryByText('Union Square')
    ).not.toBeInTheDocument()

    expect(
      screen.getByLabelText('Total SMS Credits')
    ).toHaveTextContent('0')
  })
})
