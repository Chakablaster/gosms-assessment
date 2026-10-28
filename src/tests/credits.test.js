import { describe, expect, it } from 'vitest'
import { validateCreditAmount, calculateTotalCredits } from '../logic/credits'

const outlets = [
  { id: 'one' },
  { id: 'two' },
  { id: 'three' },
  { id: 'four' },
]

describe('credit validation', () => {
  it('accepts zero and positive whole numbers', () => {
    for (const value of ['0', '1', '300', '00025']) {
      expect(validateCreditAmount(value)).toBeNull()
    }
  })

  it('treats empty and whitespace-only input as zero', () => {
    expect(validateCreditAmount('')).toBeNull()
    expect(validateCreditAmount('   ')).toBeNull()
  })

  it('rejects negative, fractional and nonnumeric input', () => {
    for (const value of ['-1', '1.5', 'abc', '1e3', '1 2']) {
      expect(validateCreditAmount(value)).toBe(
        'Enter a whole number of SMS credits (0 or more).'
      )
    }
  })

  it('checks the safe integer boundary', () => {
    expect(
      validateCreditAmount('9007199254740991')
    ).toBeNull()

    expect(
      validateCreditAmount('9007199254740992')
    ).toBe('The credit amount is too large.')
  })
})

describe('credit totals', () => {
  it('calculates the prototype total correctly', () => {
    expect(
      calculateTotalCredits(outlets, {
        one: '300',
        two: '300',
        three: '300',
        four: '0',
      })
    ).toBe(900n)
  })

  it('ignores invalid and blank amounts without changing other entries', () => {
    expect(
      calculateTotalCredits(outlets, {
        one: '250',
        two: 'abc',
        three: '',
        four: '50',
      })
    ).toBe(300n)
  })

  it('uses unique outlet IDs, not names or company IDs', () => {
    expect(
      calculateTotalCredits(outlets, {
        one: '100',
        two: '200',
        three: '300',
        four: '400',
      })
    ).toBe(1000n)
  })

  it('adds valid large amounts without losing integer precision', () => {
    expect(
      calculateTotalCredits(outlets, {
        one: '9007199254740991',
        two: '9007199254740991',
      })
    ).toBe(18014398509481982n)
  })
})
