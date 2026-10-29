{/* code */}import { describe, expect, it } from 'vitest'
import { validateCreditAmount, calculateTotalCredits } from '../logic/credits'

const outlets = [
  { id: 'st-001', name: 'Binjai Park', companyId: 'silvertree-oris' },
  { id: 'st-002', name: 'Binjai Park', companyId: 'silvertree-oris' },
  { id: 'st-003', name: 'Binjai Park', companyId: 'silvertree-binjai' },
  { id: 'st-004', name: 'US', companyId: 'silvertree-us' },
]

const invalidAmountMessage = 'Enter a whole number of SMS credits (0 or more).'
const tooLargeMessage = 'The credit amount is too large.'

describe('credit validation', () => {
  // Check that zero, positive whole numbers and values with leading zeros are accepted.
  // Zero represents an outlet that is not being topped up, while leading zeros should
  // not cause an otherwise valid amount to be rejected.
  it('accepts zero and positive whole numbers', () => {
    for (const value of ['0', '1', '300', '00025']) {
      expect(validateCreditAmount(value)).toBeNull()
    }
  })

  // Check that an empty field or whitespace-only entry is treated as zero.
  // Users should be able to leave an outlet untouched without receiving an
  // error for an amount they do not intend to allocate.
  it('accepts empty and whitespace-only input', () => {
    for (const value of ['', ' ', '   ']) {
      expect(validateCreditAmount(value)).toBeNull()
    }
  })

  // Check that negative amounts, fractions and other non-digit formats are rejected.
  // Credit allocations must be non-negative integers, not numbers that require
  // rounding or interpretation before they can be sent to the backend.
  it('rejects negative, fractional and nonnumeric amounts', () => {
    for (const value of ['-1', '1.5', 'abc', '1e3', '1 2', '+5', ' 5']) {
      expect(validateCreditAmount(value)).toBe(invalidAmountMessage)
    }
  })

  // Check the largest safe JavaScript integer and the first value above it.
  // Individual allocations are limited to safe integers so their numeric
  // validation cannot silently round a value entered by the user.
  it('enforces the safe integer limit for a single outlet', () => {
    const maximum = String(Number.MAX_SAFE_INTEGER)
    const aboveMaximum = (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString()

    expect(validateCreditAmount(maximum)).toBeNull()
    expect(validateCreditAmount(aboveMaximum)).toBe(tooLargeMessage)
  })
})

describe('credit totals', () => {
  // Check that amounts from multiple outlets are added and zero contributes nothing.
  // The total shown before quotation generation must represent the complete
  // requested top up, rather than just one outlet or one company.
  it('adds top up credits across outlets', () => {
    expect(calculateTotalCredits(outlets, {
      'st-001': '300',
      'st-002': '200',
      'st-003': '400',
      'st-004': '0',
    })).toBe(900n)
  })

  // Check that invalid and blank entries do not contribute to the running total.
  // A user should still see the sum of valid entries while correcting another
  // outlet's input, without the invalid value affecting the result.
  it('excludes invalid and blank amounts without losing valid entries', () => {
    expect(calculateTotalCredits(outlets, {
      'st-001': '250',
      'st-002': 'abc',
      'st-003': '',
      'st-004': '50',
    })).toBe(300n)
  })

  // Check that outlets with the same display name, including outlets belonging
  // to the same company, still contribute independently. The outlet ID is the
  // identifier that prevents one allocation from overwriting another.
  it('counts each outlet by its unique ID, not its name or company', () => {
    expect(outlets[0].name).toBe(outlets[1].name)
    expect(outlets[1].name).toBe(outlets[2].name)
    expect(outlets[0].companyId).toBe(outlets[1].companyId)
    expect(outlets[1].companyId).not.toBe(outlets[2].companyId)

    expect(calculateTotalCredits(outlets, {
      'st-001': '100',
      'st-002': '200',
      'st-003': '300',
    })).toBe(600n)
  })

  // Check that two individually valid amounts can be summed beyond the safe
  // integer limit without losing precision. The total uses BigInt because
  // separate outlet allocations can collectively exceed that limit.
  it('adds large valid allocations without rounding the total', () => {
    const maximum = String(Number.MAX_SAFE_INTEGER)

    expect(calculateTotalCredits(outlets, {
      'st-001': maximum,
      'st-002': maximum,
    })).toBe(BigInt(Number.MAX_SAFE_INTEGER) * 2n)
  })

  // Check that outlets without a value are treated as having zero credits.
  // Drafts can contain only the outlets the user has edited; missing entries
  // must neither break the calculation nor inflate the total.
  it('treats missing outlet amounts as zero', () => {
    expect(calculateTotalCredits(outlets, { 'st-001': '125' })).toBe(125n)
    expect(calculateTotalCredits(outlets, {})).toBe(0n)
  })

  // Check that amounts for outlets outside the supplied list are not included.
  // The screen passes only the selected brand's outlets, so stored inputs from
  // another brand must not affect its current top up total.
  it('ignores amounts belonging to outlets outside the selected list', () => {
    expect(calculateTotalCredits(outlets.slice(0, 2), {
      'st-001': '100',
      'st-002': '200',
      'st-003': '300',
      'another-brand-outlet': '900',
    })).toBe(300n)
  })
})