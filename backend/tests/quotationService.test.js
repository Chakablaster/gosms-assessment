import { describe, expect, it } from 'vitest'
import { brands, companies, outlets } from '../data/mockData.js'
import { createQuotationService, QuotationError } from '../services/quotationService.js'

function createService() {
  return createQuotationService({
    brands,
    companies,
    outlets,
    clock: () => 1793180000000,
  })
}

describe('backend quotation generation', () => {
  it('generates company breakdowns using backend records', () => {
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
    expect(quotation.companies[0].totalCredits).toBe('500')
    expect(quotation.companies[1].totalCredits).toBe('400')
  })

  it('generates unique references for consecutive quotations', () => {
    const service = createService()
    const request = {
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '100' },
    }

    const first = service.generate(request)
    const second = service.generate(request)

    expect(first.reference).not.toBe(second.reference)
  })

  it('rejects an unknown brand', () => {
    expect(() => createService().generate({
      brandId: 'unknown',
      creditsByOutlet: { 'st-001': '100' },
    })).toThrow(QuotationError)
  })

  it('rejects allocations to outlets outside the selected brand', () => {
    expect(() => createService().generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'gg-001': '100' },
    })).toThrow('Invalid SMS credit allocations.')
  })

  it('rejects invalid credit values', () => {
    const service = createService()

    expect(() => service.generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '-1' },
    })).toThrow()

    expect(() => service.generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': 100 },
    })).toThrow()
  })

  it('rejects quotations with no positive allocations', () => {
    expect(() => createService().generate({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '0' },
    })).toThrow('Allocate at least 1 SMS credit')
  })
})
