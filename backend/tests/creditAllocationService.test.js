
import { describe, expect, it } from 'vitest'
import { brands, companies, outlets } from '../data/mockData.js'
import { createQuotationService } from '../services/quotationService.js'
import { createCreditAllocationService, CreditAllocationError } from '../services/creditAllocationService.js'

function createServices() {
  return {
    quotations: createQuotationService({
      brands,
      companies,
      outlets,
      clock: () => 1793180000000,
    }),
    allocations: createCreditAllocationService({ companies, outlets }),
  }
}

function generateSilvertreeQuotation(quotations, creditsByOutlet = {
  'st-001': '300',
  'st-002': '200',
  'st-003': '400',
}) {
  return quotations.generate({
    brandId: 'silvertree',
    creditsByOutlet,
  })
}

describe('automatic SMS credit allocation', () => {
  it('allocates credits to the correct companies and outlets', () => {
    const { quotations, allocations } = createServices()
    const quotation = generateSilvertreeQuotation(quotations)

    const result = allocations.allocate(quotation)
    const balances = allocations.getBalances()

    expect(result.alreadyAllocated).toBe(false)
    expect(result.reference).toBe(quotation.reference)

    expect(balances.companyBalances['silvertree-oris']).toBe('500')
    expect(balances.companyBalances['silvertree-binjai']).toBe('400')
    expect(balances.companyBalances['silvertree-us']).toBe('0')

    expect(balances.outletBalances['st-001']).toBe('300')
    expect(balances.outletBalances['st-002']).toBe('200')
    expect(balances.outletBalances['st-003']).toBe('400')
  })

  it('does not add credits to outlets with zero allocations', () => {
    const { quotations, allocations } = createServices()

    const quotation = generateSilvertreeQuotation(quotations, {
      'st-001': '200',
      'st-002': '0',
      'st-003': '300',
      'st-004': '0',
    })

    allocations.allocate(quotation)

    const balances = allocations.getBalances()

    expect(balances.outletBalances['st-001']).toBe('200')
    expect(balances.outletBalances['st-002']).toBe('0')
    expect(balances.outletBalances['st-003']).toBe('300')
    expect(balances.outletBalances['st-004']).toBe('0')
    expect(balances.companyBalances['silvertree-us']).toBe('0')
  })

  it('accumulates credits from separate quotations', () => {
    const { quotations, allocations } = createServices()

    const first = generateSilvertreeQuotation(quotations, {
      'st-001': '100',
      'st-003': '200',
    })

    const second = generateSilvertreeQuotation(quotations, {
      'st-001': '50',
      'st-003': '75',
    })

    allocations.allocate(first)
    allocations.allocate(second)

    const balances = allocations.getBalances()

    expect(balances.outletBalances['st-001']).toBe('150')
    expect(balances.outletBalances['st-003']).toBe('275')
    expect(balances.companyBalances['silvertree-oris']).toBe('150')
    expect(balances.companyBalances['silvertree-binjai']).toBe('275')
  })

  it('prevents duplicate allocation of the same quotation', () => {
    const { quotations, allocations } = createServices()
    const quotation = generateSilvertreeQuotation(quotations)

    const first = allocations.allocate(quotation)
    const second = allocations.allocate(quotation)

    expect(first.alreadyAllocated).toBe(false)
    expect(second.alreadyAllocated).toBe(true)

    const balances = allocations.getBalances()

    expect(balances.companyBalances['silvertree-oris']).toBe('500')
    expect(balances.companyBalances['silvertree-binjai']).toBe('400')
  })

  it('rejects changed allocations using an already processed reference', () => {
    const { quotations, allocations } = createServices()
    const quotation = generateSilvertreeQuotation(quotations)

    allocations.allocate(quotation)

    const changed = structuredClone(quotation)
    changed.companies[0].outlets[0].credits = '350'
    changed.companies[0].totalCredits = '550'
    changed.totalCredits = '950'

    expect(() => allocations.allocate(changed))
      .toThrow('Quotation reference was already allocated with different credits.')

    expect(allocations.getBalances().companyBalances['silvertree-oris']).toBe('500')
  })

  it('rejects outlets assigned to the wrong company', () => {
    const { quotations, allocations } = createServices()
    const quotation = generateSilvertreeQuotation(quotations)

    const invalid = structuredClone(quotation)
    invalid.companies[1].outlets[0].outletId = 'st-004'

    expect(() => allocations.allocate(invalid)).toThrow(CreditAllocationError)

    expect(allocations.getBalances().companyBalances['silvertree-binjai']).toBe('0')
    expect(allocations.getBalances().companyBalances['silvertree-us']).toBe('0')
  })

  it('rejects outlets belonging to another brand', () => {
    const { quotations, allocations } = createServices()
    const quotation = generateSilvertreeQuotation(quotations)

    const invalid = structuredClone(quotation)
    invalid.brandId = 'gordon-grill'

    expect(() => allocations.allocate(invalid)).toThrow(CreditAllocationError)

    expect(allocations.getBalances().companyBalances['silvertree-oris']).toBe('0')
  })

  it('does not partially allocate credits when processing fails', () => {
    const { quotations, allocations } = createServices()
    const quotation = generateSilvertreeQuotation(quotations)

    const invalid = structuredClone(quotation)
    invalid.companies[1].totalCredits = '999'

    expect(() => allocations.allocate(invalid))
      .toThrow('Company credit total does not match the allocation.')

    const balances = allocations.getBalances()

    expect(balances.companyBalances['silvertree-oris']).toBe('0')
    expect(balances.companyBalances['silvertree-binjai']).toBe('0')
    expect(balances.outletBalances['st-001']).toBe('0')
    expect(balances.outletBalances['st-003']).toBe('0')
  })

  it('rejects malformed quotations without changing balances', () => {
    const { allocations } = createServices()

    expect(() => allocations.allocate(null)).toThrow(CreditAllocationError)
    expect(() => allocations.allocate({ reference: 'invalid' })).toThrow(CreditAllocationError)

    const balances = allocations.getBalances()

    expect(Object.values(balances.companyBalances).every((credits) => credits === '0')).toBe(true)
    expect(Object.values(balances.outletBalances).every((credits) => credits === '0')).toBe(true)
  })

  it('rejects duplicate outlet entries', () => {
    const { quotations, allocations } = createServices()
    const quotation = generateSilvertreeQuotation(quotations)

    const invalid = structuredClone(quotation)
    invalid.companies[0].outlets.push({
      ...invalid.companies[0].outlets[0],
    })

    expect(() => allocations.allocate(invalid)).toThrow('Invalid outlet allocation.')

    expect(allocations.getBalances().companyBalances['silvertree-oris']).toBe('0')
  })
})
