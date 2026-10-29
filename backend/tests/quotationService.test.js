import { describe, expect, it } from 'vitest'
import { brands, companies, outlets } from '../data/mockData.js'
import { createQuotationService } from '../services/quotationService.js'

function createService(clock = Date.now) {
  return createQuotationService({ brands, companies, outlets, clock })
}

describe('quotation service', () => {
  it('builds a quotation using the correct brand, company and outlet records', () => {
    // These outlets belong to two different companies under Silvertree.
    // The company details should come from the backend records, not from the request.
    const quotation = createService().generate({
      brandId: 'silvertree',
      creditsByOutlet: {
        'st-001': '300',
        'st-002': '200',
        'st-003': '400',
      },
    })

    expect(quotation.brandName).toBe('Silvertree Restaurants')
    expect(quotation.totalCredits).toBe('900')
    expect(quotation.companies).toHaveLength(2)

    const [oris, binjai] = quotation.companies

    expect(oris.companyId).toBe('silvertree-oris')
    expect(oris.companyName).toBe('Silvertree Oris Sdn Bhd')
    expect(oris.outlets.map((outlet) => outlet.outletId)).toEqual(['st-001', 'st-002'])
    expect(oris.totalCredits).toBe('500')

    expect(binjai.companyId).toBe('silvertree-binjai')
    expect(binjai.companyName).toBe('Silvertree Binjai Sdn Bhd')
    expect(binjai.outlets.map((outlet) => outlet.outletId)).toEqual(['st-003'])
    expect(binjai.totalCredits).toBe('400')
  })

  it('gives consecutive quotations different references even at the same time', () => {
    // Freeze the clock to check that two quick requests cannot share a reference.
    const fixedTime = Date.parse('2026-10-28T09:00:00.000Z')
    const service = createService(() => fixedTime)
    const request = {
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '100' },
    }

    const first = service.generate(request)
    const second = service.generate(request)

    expect(first.reference).not.toBe(second.reference)
    expect(first.generatedAt).not.toBe(second.generatedAt)
  })

  it('rejects a brand that does not exist', () => {
    expect(() => createService().generate({
      brandId: 'unknown-brand',
      creditsByOutlet: { 'st-001': '100' },
    })).toThrow('Client brand not found.')
  })

  it('rejects an outlet that belongs to another brand', () => {
    // gg-001 is a real outlet, but it belongs to Gordon Grill, not Silvertree.
    expect(() => createService().generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'gg-001': '100' },
    })).toThrow('Invalid SMS credit allocations.')
  })

  it('rejects invalid amounts and values sent in the wrong format', () => {
    const service = createService()

    expect(() => service.generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '-1' },
    })).toThrow('Correct the invalid SMS credit amounts before generating a quotation.')

    // Credit amounts in an API request must be strings, not numbers.
    expect(() => service.generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': 100 },
    })).toThrow('Invalid SMS credit allocations.')
  })

  it('does not generate a quotation when no credits are requested', () => {
    expect(() => createService().generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '0' },
    })).toThrow('Allocate at least 1 SMS credit to generate a quotation.')
  })
})
