import { describe, expect, it } from 'vitest'
import { generateQuotation } from '../logic/quotation'

const brand = { id: 'silvertree', name: 'Silvertree Restaurants' }
const outlets = [
  { id: 'st-001', companyId: 'co-1', companyName: 'Company One', name: 'Binjai Park', outletCode: 'BP-01' },
  { id: 'st-002', companyId: 'co-1', companyName: 'Company One', name: 'Binjai Park', outletCode: 'BP-02' },
  { id: 'st-003', companyId: 'co-2', companyName: 'Company Two', name: 'Union Square', outletCode: 'US-01' },
  { id: 'st-004', companyId: 'co-3', companyName: 'Company Three', name: 'Unused', outletCode: 'XX-01' },
]
const date = new Date('2026-10-28T09:00:00.000Z')

describe('quotation generation', () => {
  it('groups allocated outlets by company without merging duplicate names', () => {
    const { quotation, error } = generateQuotation(brand, outlets, {
      'st-001': '300', 'st-002': '200', 'st-003': '400', 'st-004': '0',
    }, date)

    expect(error).toBeNull()
    expect(quotation.brandName).toBe('Silvertree Restaurants')
    expect(quotation.generatedAt).toBe(date.toISOString())
    expect(quotation.reference).toBe(`QT-${date.getTime()}`)
    expect(quotation.companies).toHaveLength(2)
    expect(quotation.companies[0].companyName).toBe('Company One')
    expect(quotation.companies[0].outlets.map((outlet) => outlet.outletCode)).toEqual(['BP-01', 'BP-02'])
    expect(quotation.companies[0].totalCredits).toBe('500')
    expect(quotation.companies[1].totalCredits).toBe('400')
    expect(quotation.totalCredits).toBe('900')
  })

  it('omits zero and empty allocations and their companies', () => {
    const { quotation } = generateQuotation(brand, outlets, {
      'st-001': '100', 'st-002': '', 'st-003': '0', 'st-004': ' ',
    }, date)

    expect(quotation.companies).toHaveLength(1)
    expect(quotation.companies[0].outlets).toHaveLength(1)
    expect(quotation.totalCredits).toBe('100')
  })

  it('blocks a zero credit quotation', () => {
    const result = generateQuotation(brand, outlets, {}, date)
    expect(result.quotation).toBeNull()
    expect(result.error).toMatch(/at least 1 SMS credit/)
  })

  it('blocks a quotation when any selected outlet has invalid credits', () => {
    const result = generateQuotation(brand, outlets, {
      'st-001': '100', 'st-002': '-2',
    }, date)
    expect(result.quotation).toBeNull()
    expect(result.error).toMatch(/Correct the invalid/)
  })

  it('blocks missing brand or empty outlet data', () => {
    expect(generateQuotation(null, outlets, {}, date).quotation).toBeNull()
    expect(generateQuotation(brand, [], {}, date).quotation).toBeNull()
  })

  it('preserves large credit totals precisely as strings', () => {
    const { quotation } = generateQuotation(brand, outlets, {
      'st-001': '9007199254740991', 'st-002': '9007199254740991',
    }, date)
    expect(quotation.companies[0].totalCredits).toBe('18014398509481982')
    expect(quotation.totalCredits).toBe('18014398509481982')
    expect(() => JSON.stringify(quotation)).not.toThrow()
  })
})
