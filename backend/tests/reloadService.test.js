
import { describe, expect, it } from 'vitest'
import { brands, companies, outlets } from '../data/mockData.js'
import { createQuotationService } from '../services/quotationService.js'
import { createCreditAllocationService, CreditAllocationError } from '../services/creditAllocationService.js'
import { createReloadService, ReloadError } from '../services/reloadService.js'

function createServices() {
  const quotationService = createQuotationService({
    brands,
    companies,
    outlets,
    clock: () => 1793180000000,
  })

  const creditAllocationService = createCreditAllocationService({ companies, outlets })
  const reloadService = createReloadService({ quotationService, creditAllocationService })

  return { quotationService, creditAllocationService, reloadService }
}

function reloadPayload(operationId = 'reload-operation-001', creditsByOutlet = {
  'st-001': '300',
  'st-002': '200',
  'st-003': '400',
}) {
  return {
    operationId,
    brandId: 'silvertree',
    creditsByOutlet,
  }
}

describe('SMS credit reload workflow', () => {
  it('generates a quotation and allocates credits to the correct company accounts', () => {
    const { reloadService, creditAllocationService } = createServices()

    const result = reloadService.processReload(reloadPayload())
    const balances = creditAllocationService.getBalances()

    expect(result.quotation.totalCredits).toBe('900')
    expect(result.quotation.companies).toHaveLength(2)
    expect(result.allocation.reference).toBe(result.quotation.reference)
    expect(result.allocation.alreadyAllocated).toBe(false)

    expect(balances.companyBalances['silvertree-oris']).toBe('500')
    expect(balances.companyBalances['silvertree-binjai']).toBe('400')
    expect(balances.companyBalances['silvertree-us']).toBe('0')
    expect(balances.outletBalances['st-001']).toBe('300')
    expect(balances.outletBalances['st-002']).toBe('200')
    expect(balances.outletBalances['st-003']).toBe('400')
  })

  it('returns the original quotation when the same operation is retried', () => {
    const { reloadService, creditAllocationService } = createServices()
    const payload = reloadPayload()

    const first = reloadService.processReload(payload)
    const retry = reloadService.processReload(payload)

    expect(retry.quotation).toEqual(first.quotation)
    expect(retry.allocation.reference).toBe(first.quotation.reference)
    expect(first.allocation.alreadyAllocated).toBe(false)
    expect(retry.allocation.alreadyAllocated).toBe(true)

    const balances = creditAllocationService.getBalances()

    expect(balances.companyBalances['silvertree-oris']).toBe('500')
    expect(balances.companyBalances['silvertree-binjai']).toBe('400')
  })

  it('rejects changed credit amounts using an already processed operation identifier', () => {
    const { reloadService, creditAllocationService } = createServices()

    reloadService.processReload(reloadPayload())

    const changed = reloadPayload('reload-operation-001', {
      'st-001': '600',
    })

    expect(() => reloadService.processReload(changed))
      .toThrow('This top up operation has already been processed with different details.')

    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('300')
  })

  it('rejects reusing an operation identifier for another brand', () => {
    const { reloadService, creditAllocationService } = createServices()

    reloadService.processReload(reloadPayload())

    expect(() => reloadService.processReload({
      operationId: 'reload-operation-001',
      brandId: 'gordon-grill',
      creditsByOutlet: { 'gg-001': '50' },
    })).toThrow(ReloadError)

    expect(creditAllocationService.getBalances().outletBalances['gg-001']).toBe('0')
  })

  it('treats separate operations as separate top ups', () => {
    const { reloadService, creditAllocationService } = createServices()

    const first = reloadService.processReload(
      reloadPayload('reload-operation-001', { 'st-001': '100' })
    )

    const second = reloadService.processReload(
      reloadPayload('reload-operation-002', { 'st-001': '100' })
    )

    expect(first.quotation.reference).not.toBe(second.quotation.reference)
    expect(second.allocation.alreadyAllocated).toBe(false)
    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('200')
  })

  it('recognizes the same request even when outlet keys are reordered', () => {
    const { reloadService, creditAllocationService } = createServices()

    const first = reloadService.processReload(
      reloadPayload('reload-operation-001', {
        'st-003': '400',
        'st-001': '300',
      })
    )

    const retry = reloadService.processReload(
      reloadPayload('reload-operation-001', {
        'st-001': '300',
        'st-003': '400',
      })
    )

    expect(retry.quotation.reference).toBe(first.quotation.reference)
    expect(retry.allocation.alreadyAllocated).toBe(true)
    expect(creditAllocationService.getBalances().companyBalances['silvertree-oris']).toBe('300')
    expect(creditAllocationService.getBalances().companyBalances['silvertree-binjai']).toBe('400')
  })

  it('leaves zero-credit outlets unchanged', () => {
    const { reloadService, creditAllocationService } = createServices()

    reloadService.processReload(
      reloadPayload('reload-operation-001', {
        'st-001': '250',
        'st-002': '0',
        'st-003': '0',
      })
    )

    const balances = creditAllocationService.getBalances()

    expect(balances.outletBalances['st-001']).toBe('250')
    expect(balances.outletBalances['st-002']).toBe('0')
    expect(balances.outletBalances['st-003']).toBe('0')
    expect(balances.companyBalances['silvertree-binjai']).toBe('0')
  })

  it('allows a corrected retry when quotation generation failed', () => {
    const { reloadService, creditAllocationService } = createServices()

    expect(() => reloadService.processReload(
      reloadPayload('reload-operation-001', { 'st-001': '-100' })
    )).toThrow()

    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('0')

    const corrected = reloadService.processReload(
      reloadPayload('reload-operation-001', { 'st-001': '100' })
    )

    expect(corrected.allocation.alreadyAllocated).toBe(false)
    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('100')
  })

  it('allows retrying after allocation fails without recording a completed operation', () => {
    const { quotationService, creditAllocationService } = createServices()
    let attempts = 0

    const failingAllocationService = {
      allocate(quotation) {
        attempts += 1

        if (attempts === 1) {
          throw new CreditAllocationError('Credit processing temporarily failed.')
        }

        return creditAllocationService.allocate(quotation)
      },
    }

    const reloadService = createReloadService({
      quotationService,
      creditAllocationService: failingAllocationService,
    })

    const payload = reloadPayload('reload-operation-001', { 'st-001': '150' })

    expect(() => reloadService.processReload(payload))
      .toThrow('Credit processing temporarily failed.')

    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('0')

    const retry = reloadService.processReload(payload)

    expect(attempts).toBe(2)
    expect(retry.allocation.alreadyAllocated).toBe(false)
    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('150')
  })

  it('rejects invalid operation identifiers without generating allocations', () => {
    const { reloadService, creditAllocationService } = createServices()

    for (const operationId of ['', 'invalid!', null]) {
      expect(() => reloadService.processReload(
        reloadPayload(operationId)
      )).toThrow('Invalid top up operation identifier.')
    }

    expect(() => reloadService.processReload({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '300' },
    })).toThrow('Invalid top up operation identifier.')

    const balances = creditAllocationService.getBalances()

    expect(balances.companyBalances['silvertree-oris']).toBe('0')
    expect(balances.companyBalances['silvertree-binjai']).toBe('0')
  })
})
