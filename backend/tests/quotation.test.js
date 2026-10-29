
import { describe, expect, it } from 'vitest'
import { generateQuotation } from '../logic/quotation.js'

const brand = { id: 'silvertree', name: 'Silvertree Restaurants' }

// These outlets follow the original Silvertree example.
// Three share the name Binjai Park, but belong to different outlet records.
const outlets = [
  { id: 'st-001', companyId: 'silvertree-oris', companyName: 'Silvertree Oris Sdn Bhd', name: 'Binjai Park', outletCode: 'ST-BP-01' },
  { id: 'st-002', companyId: 'silvertree-oris', companyName: 'Silvertree Oris Sdn Bhd', name: 'Binjai Park', outletCode: 'ST-BP-02' },
  { id: 'st-003', companyId: 'silvertree-binjai', companyName: 'Silvertree Binjai Sdn Bhd', name: 'Binjai Park', outletCode: 'ST-BP-03' },
  { id: 'st-004', companyId: 'silvertree-us', companyName: 'Silvertree US Sdn Bhd', name: 'Union Square', outletCode: 'ST-US-01' },
]

const quotationDate = new Date('2026-10-28T09:00:00.000Z')

describe('quotation generation', () => {
  it('groups credits by company without mixing up outlets with the same name', () => {
    const { quotation, error } = generateQuotation(brand, outlets, {
      'st-001': '300',
      'st-002': '200',
      'st-003': '400',
      'st-004': '0',
    }, quotationDate)

    expect(error).toBeNull()
    expect(quotation.brandName).toBe('Silvertree Restaurants')
    expect(quotation.generatedAt).toBe(quotationDate.toISOString())
    expect(quotation.reference).toBe(`QT-${quotationDate.getTime()}`)

    expect(quotation.companies).toHaveLength(2)

    const [oris, binjai] = quotation.companies

    expect(oris.companyId).toBe('silvertree-oris')
    expect(oris.totalCredits).toBe('500')
    expect(oris.outlets.map((outlet) => outlet.outletId)).toEqual(['st-001', 'st-002'])
    expect(oris.outlets.map((outlet) => outlet.outletCode)).toEqual(['ST-BP-01', 'ST-BP-02'])
    expect(oris.outlets.map((outlet) => outlet.credits)).toEqual(['300', '200'])

    expect(binjai.companyId).toBe('silvertree-binjai')
    expect(binjai.totalCredits).toBe('400')
    expect(binjai.outlets[0].outletId).toBe('st-003')

    expect(quotation.totalCredits).toBe('900')
  })

  it('leaves out outlets that are not receiving credits', () => {
    // Empty fields, spaces and zero all mean no top up.
    // Companies with no allocated outlets should not appear either.
    const { quotation, error } = generateQuotation(brand, outlets, {
      'st-001': '100',
      'st-002': '',
      'st-003': '0',
      'st-004': ' ',
    }, quotationDate)

    expect(error).toBeNull()
    expect(quotation.companies).toHaveLength(1)
    expect(quotation.companies[0].companyId).toBe('silvertree-oris')
    expect(quotation.companies[0].outlets).toHaveLength(1)
    expect(quotation.companies[0].outlets[0].outletId).toBe('st-001')
    expect(quotation.totalCredits).toBe('100')
  })

  it('does not generate a quotation when no credits are allocated', () => {
    const result = generateQuotation(brand, outlets, {}, quotationDate)

    expect(result.quotation).toBeNull()
    expect(result.error).toBe('Allocate at least 1 SMS credit to generate a quotation.')
  })

  it('rejects the whole quotation if one outlet has an invalid amount', () => {
    // The first outlet is valid, but the second has a negative amount.
    // We should not generate a partial quotation using only the valid entry.
    const result = generateQuotation(brand, outlets, {
      'st-001': '100',
      'st-002': '-2',
    }, quotationDate)

    expect(result.quotation).toBeNull()
    expect(result.error).toBe('Correct the invalid SMS credit amounts before generating a quotation.')
  })

  it('does not generate a quotation without a selected brand', () => {
    const result = generateQuotation(null, outlets, {
      'st-001': '100',
    }, quotationDate)

    expect(result.quotation).toBeNull()
    expect(result.error).toBe('Select a brand with outlets before generating a quotation.')
  })

  it('does not generate a quotation when the brand has no outlets', () => {
    const result = generateQuotation(brand, [], {}, quotationDate)

    expect(result.quotation).toBeNull()
    expect(result.error).toBe('Select a brand with outlets before generating a quotation.')
  })

  it('calculates large totals without losing precision', () => {
    // Each outlet can receive up to the maximum safe integer.
    // Their combined total can exceed that limit, so it must remain exact.
    const maximumCredits = Number.MAX_SAFE_INTEGER.toString()

    const { quotation, error } = generateQuotation(brand, outlets, {
      'st-001': maximumCredits,
      'st-002': maximumCredits,
    }, quotationDate)

    expect(error).toBeNull()
    expect(quotation.companies[0].totalCredits).toBe('18014398509481982')
    expect(quotation.totalCredits).toBe('18014398509481982')
    expect(() => JSON.stringify(quotation)).not.toThrow()
  })
})
