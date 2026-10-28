import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('GoSMS Application', () => {
  it('renders the application heading', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: 'GoSMS Assessment',
      })
    ).toBeInTheDocument()
  })

  it('displays the SMS credit reload feature', () => {
    render(<App />)

    expect(
      screen.getByText('SMS Credit Reload Feature')
    ).toBeInTheDocument()
  })
})