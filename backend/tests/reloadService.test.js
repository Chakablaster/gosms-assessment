import { describe, expect, it, vi } from 'vitest'
import { brands, companies, outlets } from '../data/mockData.js'
import { createQuotationService } from '../services/quotationService.js'
import { createCreditAllocationService, CreditAllocationError } from '../services/creditAllocationService.js'
import { createReloadService, ReloadError } from '../services/reloadService.js'

const initialReload = {
  operationId: 'silvertree-reload-001',
  brandId: 'silvertree',
  creditsByOutlet: {
    'st-001': '300',
    'st-002': '200',
    'st-003': '400',
  },
}

function createServices() {
  const quotationService = createQuotationService({ brands, companies, outlets })
  const creditAllocationService = createCreditAllocationService({ companies, outlets })
  const reloadService = createReloadService({ quotationService, creditAllocationService })

  return { quotationService, creditAllocationService, reloadService }
}

function getThrownError(action) {
  try {
    action()
  } catch (error) {
    return error
  }

  return null
}

describe('SMS credit reload workflow', () => {
  it('creates a quotation and credits the correct companies and outlets', () => {
    const { reloadService, creditAllocationService } = createServices()

    const result = reloadService.processReload(initialReload)
    const balances = creditAllocationService.getBalances()

    expect(result.quotation.brandId).toBe('silvertree')
    expect(result.quotation.totalCredits).toBe('900')
    expect(result.quotation.companies).toHaveLength(2)
    expect(result.allocation).toEqual({
      reference: result.quotation.reference,
      alreadyAllocated: false,
    })
    expect(balances.companyBalances).toMatchObject({
      'silvertree-oris': '500',
      'silvertree-binjai': '400',
      'silvertree-us': '0',
    })
    expect(balances.outletBalances).toMatchObject({
      'st-001': '300',
      'st-002': '200',
      'st-003': '400',
      'st-004': '0',
    })
  })

  it('returns the original quotation on retry without adding credits again', () => {
    // A client might retry if it never received the first response.
    const { reloadService, creditAllocationService } = createServices()
    const first = reloadService.processReload(initialReload)
    const balancesAfterFirst = creditAllocationService.getBalances()

    const retry = reloadService.processReload(initialReload)

    expect(first.allocation.alreadyAllocated).toBe(false)
    expect(retry.quotation).toEqual(first.quotation)
    expect(retry.allocation).toEqual({
      reference: first.quotation.reference,
      alreadyAllocated: true,
    })
    expect(creditAllocationService.getBalances()).toEqual(balancesAfterFirst)
  })

  it('rejects changed amounts under an already completed operation ID', () => {
    const { reloadService, creditAllocationService } = createServices()
    reloadService.processReload(initialReload)
    const originalBalances = creditAllocationService.getBalances()

    const changed = {
      ...initialReload,
      creditsByOutlet: { ...initialReload.creditsByOutlet, 'st-001': '350' },
    }
    const error = getThrownError(() => reloadService.processReload(changed))

    expect(error).toBeInstanceOf(ReloadError)
    expect(error).toMatchObject({
      status: 409,
      message: 'This top up operation has already been processed with different details.',
    })
    expect(creditAllocationService.getBalances()).toEqual(originalBalances)
  })

  it('rejects reusing an operation ID for a different brand', () => {
    const { reloadService, creditAllocationService } = createServices()
    reloadService.processReload(initialReload)
    const originalBalances = creditAllocationService.getBalances()

    const error = getThrownError(() => reloadService.processReload({
      operationId: initialReload.operationId,
      brandId: 'gordon-grill',
      creditsByOutlet: { 'gg-001': '50' },
    }))

    expect(error).toBeInstanceOf(ReloadError)
    expect(error).toMatchObject({
      status: 409,
      message: 'This top up operation has already been processed with different details.',
    })
    expect(creditAllocationService.getBalances()).toEqual(originalBalances)
  })

  it('adds credits again when a new operation ID is used', () => {
    const { reloadService, creditAllocationService } = createServices()
    const first = reloadService.processReload({
      ...initialReload,
      creditsByOutlet: { 'st-001': '100' },
    })
    const second = reloadService.processReload({
      ...initialReload,
      operationId: 'silvertree-reload-002',
      creditsByOutlet: { 'st-001': '100' },
    })

    expect(first.allocation.alreadyAllocated).toBe(false)
    expect(second.allocation.alreadyAllocated).toBe(false)
    expect(second.quotation.reference).not.toBe(first.quotation.reference)
    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('200')
  })

  it('recognises a retry even when the outlet entries arrive in a different order', () => {
    // The order of fields in a request should not change what was allocated.
    const { reloadService, creditAllocationService } = createServices()
    const first = reloadService.processReload({
      ...initialReload,
      creditsByOutlet: { 'st-003': '400', 'st-001': '300' },
    })
    const balancesAfterFirst = creditAllocationService.getBalances()

    const retry = reloadService.processReload({
      ...initialReload,
      creditsByOutlet: { 'st-001': '300', 'st-003': '400' },
    })

    expect(retry.quotation).toEqual(first.quotation)
    expect(retry.allocation.alreadyAllocated).toBe(true)
    expect(creditAllocationService.getBalances()).toEqual(balancesAfterFirst)
  })

  it('leaves outlets with zero requested credits unchanged', () => {
    const { reloadService, creditAllocationService } = createServices()
    reloadService.processReload({
      ...initialReload,
      creditsByOutlet: { 'st-001': '250', 'st-002': '0', 'st-003': '0' },
    })

    const balances = creditAllocationService.getBalances()
    expect(balances.outletBalances).toMatchObject({
      'st-001': '250',
      'st-002': '0',
      'st-003': '0',
    })
    expect(balances.companyBalances['silvertree-oris']).toBe('250')
    expect(balances.companyBalances['silvertree-binjai']).toBe('0')
  })

  it('allows a corrected request after quotation generation fails', () => {
    // A rejected request must not reserve its operation ID.
    const { reloadService, creditAllocationService } = createServices()
    const balancesBefore = creditAllocationService.getBalances()

    expect(() => reloadService.processReload({
      ...initialReload,
      creditsByOutlet: { 'st-001': '-100' },
    })).toThrow('Correct the invalid SMS credit amounts before generating a quotation.')
    expect(creditAllocationService.getBalances()).toEqual(balancesBefore)

    const corrected = reloadService.processReload({
      ...initialReload,
      creditsByOutlet: { 'st-001': '100' },
    })

    expect(corrected.allocation.alreadyAllocated).toBe(false)
    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('100')
  })

  it('allows retrying when credit allocation fails the first time', () => {
    // Simulate a temporary allocation failure, then let the real allocator handle the retry.
    const { quotationService, creditAllocationService } = createServices()
    const allocate = vi.fn()
      .mockImplementationOnce(() => {
        throw new CreditAllocationError('Credit processing temporarily failed.')
      })
      .mockImplementation((quotation) => creditAllocationService.allocate(quotation))
    const reloadService = createReloadService({
      quotationService,
      creditAllocationService: { allocate },
    })
    const request = { ...initialReload, creditsByOutlet: { 'st-001': '150' } }
    const balancesBefore = creditAllocationService.getBalances()

    expect(() => reloadService.processReload(request))
      .toThrow('Credit processing temporarily failed.')
    expect(creditAllocationService.getBalances()).toEqual(balancesBefore)

    const retry = reloadService.processReload(request)

    expect(allocate).toHaveBeenCalledTimes(2)
    expect(retry.allocation.alreadyAllocated).toBe(false)
    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('150')
  })

  it('rejects missing, malformed and out-of-range operation IDs', () => {
    // Operation IDs must be 8–128 characters and use letters, numbers, _ or -.
    const { reloadService, creditAllocationService } = createServices()
    const balancesBefore = creditAllocationService.getBalances()

    for (const operationId of ['', 'x'.repeat(7), 'x'.repeat(129), 'reload 001', null]) {
      expect(() => reloadService.processReload({ ...initialReload, operationId }))
        .toThrow('Invalid top up operation identifier.')
    }

    expect(() => reloadService.processReload({
      brandId: 'silvertree',
      creditsByOutlet: { 'st-001': '100' },
    })).toThrow('Invalid top up operation identifier.')
    expect(creditAllocationService.getBalances()).toEqual(balancesBefore)
  })

  it('accepts operation IDs at the minimum and maximum allowed lengths', () => {
    const { reloadService, creditAllocationService } = createServices()

    for (const length of [8, 128]) {
      const result = reloadService.processReload({
        ...initialReload,
        operationId: 'x'.repeat(length),
        creditsByOutlet: { 'st-001': '100' },
      })
      expect(result.allocation.alreadyAllocated).toBe(false)
    }

    expect(creditAllocationService.getBalances().outletBalances['st-001']).toBe('200')
  })
})
