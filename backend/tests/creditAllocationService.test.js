import { describe, expect, it } from 'vitest'
import { brands, companies, outlets } from '../data/mockData.js'
import { createQuotationService } from '../services/quotationService.js'
import { createCreditAllocationService, CreditAllocationError } from '../services/creditAllocationService.js'

function createTestServices() {
  return {
    quotations: createQuotationService({ brands, companies, outlets }),
    allocations: createCreditAllocationService({ companies, outlets }),
  }
}

// Silvertree's first two outlets belong to Oris, and the third belongs to Binjai.
// Using outlets from different companies helps catch incorrect allocations.
function makeQuotation(quotations, creditsByOutlet = {
  'st-001': '300',
  'st-002': '200',
  'st-003': '400',
}) {
  return quotations.generate({ brandId: 'silvertree', creditsByOutlet })
}

describe('SMS credit allocation', () => {
  it('credits the correct outlets and company accounts', () => {
    // The total alone is not enough: 900 credits could still go to the wrong outlets.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations)

    const result = allocations.allocate(quotation)
    const balances = allocations.getBalances()

    expect(result).toEqual({ reference: quotation.reference, alreadyAllocated: false })
    expect(balances.companyBalances).toMatchObject({
      'silvertree-oris': '500',
      'silvertree-binjai': '400',
      'silvertree-us': '0',
    })
    expect(balances.outletBalances).toMatchObject({
      'st-001': '300',
      'st-002': '200',
      'st-003': '400',
    })
  })

  it('leaves outlets alone when their requested top up is zero', () => {
    // A brand may top up only some outlets; the others must stay unchanged.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations, {
      'st-001': '200',
      'st-002': '0',
      'st-003': '300',
      'st-004': '0',
    })

    allocations.allocate(quotation)
    const balances = allocations.getBalances()

    expect(balances.outletBalances).toMatchObject({
      'st-001': '200',
      'st-002': '0',
      'st-003': '300',
      'st-004': '0',
    })
    expect(balances.companyBalances['silvertree-us']).toBe('0')
  })

  it('adds a later top up to the existing balance', () => {
    // A new quotation adds credits; it must not replace an earlier allocation.
    const { quotations, allocations } = createTestServices()
    const first = makeQuotation(quotations, {
      'st-001': '100',
      'st-003': '200',
    })
    const second = makeQuotation(quotations, {
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

  it('does not allocate credits again for the same quotation', () => {
    // A retry can arrive after the first response was lost.
    // The second call should confirm the original allocation, not repeat it.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations)

    const first = allocations.allocate(quotation)
    const balancesAfterFirst = allocations.getBalances()
    const retry = allocations.allocate(quotation)

    expect(first.alreadyAllocated).toBe(false)
    expect(retry).toEqual({ reference: quotation.reference, alreadyAllocated: true })
    expect(allocations.getBalances()).toEqual(balancesAfterFirst)
  })

  it('rejects changed amounts under an already allocated reference', () => {
    // Even when the changed totals add up, an old reference cannot be reused
    // for a different allocation.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations)
    allocations.allocate(quotation)
    const originalBalances = allocations.getBalances()

    const changed = structuredClone(quotation)
    changed.companies[0].outlets[0].credits = '350'
    changed.companies[0].totalCredits = '550'
    changed.totalCredits = '950'

    expect(() => allocations.allocate(changed))
      .toThrow('Quotation reference was already allocated with different credits.')
    expect(allocations.getBalances()).toEqual(originalBalances)
  })

  it('rejects an outlet listed under the wrong company', () => {
    // st-004 is a real Silvertree outlet, but it belongs to the US company,
    // not Binjai. A valid outlet ID is not enough to approve an allocation.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations)
    const balancesBefore = allocations.getBalances()

    const invalid = structuredClone(quotation)
    invalid.companies[1].outlets[0].outletId = 'st-004'

    expect(() => allocations.allocate(invalid)).toThrow(CreditAllocationError)
    expect(allocations.getBalances()).toEqual(balancesBefore)
  })

  it('rejects a quotation that names the wrong brand', () => {
    // The outlets belong to Silvertree; changing only the brand must not pass.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations)
    const balancesBefore = allocations.getBalances()

    const invalid = structuredClone(quotation)
    invalid.brandId = 'gordon-grill'

    expect(() => allocations.allocate(invalid)).toThrow(CreditAllocationError)
    expect(allocations.getBalances()).toEqual(balancesBefore)
  })

  it('leaves every balance unchanged if a company total is wrong', () => {
    // The error is in the second company. The first must not receive credits
    // before the service discovers that the quotation is invalid.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations)
    const balancesBefore = allocations.getBalances()

    const invalid = structuredClone(quotation)
    invalid.companies[1].totalCredits = '999'

    expect(() => allocations.allocate(invalid))
      .toThrow('Company credit total does not match the allocation.')
    expect(allocations.getBalances()).toEqual(balancesBefore)
  })

  it('rejects missing or malformed quotation data', () => {
    // Neither request contains the information needed to allocate credits.
    const { allocations } = createTestServices()
    const balancesBefore = allocations.getBalances()

    expect(() => allocations.allocate(null)).toThrow(CreditAllocationError)
    expect(() => allocations.allocate({ reference: 'invalid' })).toThrow(CreditAllocationError)
    expect(allocations.getBalances()).toEqual(balancesBefore)
  })

  it('rejects an outlet appearing twice in one quotation', () => {
    // Duplicate entries could otherwise credit the same outlet twice.
    const { quotations, allocations } = createTestServices()
    const quotation = makeQuotation(quotations)
    const balancesBefore = allocations.getBalances()

    const invalid = structuredClone(quotation)
    invalid.companies[0].outlets.push({ ...invalid.companies[0].outlets[0] })

    expect(() => allocations.allocate(invalid)).toThrow('Invalid outlet allocation.')
    expect(allocations.getBalances()).toEqual(balancesBefore)
  })
})
