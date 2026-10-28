
import { describe, expect, it, vi } from 'vitest'
import { getBusinesses, getCreditBalances, createQuotation } from '../services/gosmsApi'

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

describe('GoSMS API service', () => {
  it('retrieves business records from the backend', async () => {
    const data = {
      brands: [{ id: 'silvertree', name: 'Silvertree Restaurants' }],
      companies: [],
      outlets: [],
    }

    const request = vi.fn().mockResolvedValue(response(200, data))

    await expect(getBusinesses(request)).resolves.toEqual(data)

    expect(request).toHaveBeenCalledWith('/api/businesses', {
      method: 'GET',
    })
  })

  it('rejects invalid business data', async () => {
    const request = vi.fn().mockResolvedValue(response(200, {
      brands: [],
      companies: null,
      outlets: [],
    }))

    await expect(getBusinesses(request)).rejects.toThrow('Invalid business data received.')
  })

  it('retrieves separate company and outlet balances', async () => {
    const balances = {
      companyBalances: {
        'silvertree-oris': '500',
        'silvertree-binjai': '400',
        'silvertree-us': '0',
      },
      outletBalances: {
        'st-001': '300',
        'st-002': '200',
        'st-003': '400',
        'st-004': '0',
      },
    }

    const request = vi.fn().mockResolvedValue(response(200, balances))

    await expect(getCreditBalances(request)).resolves.toEqual(balances)

    expect(request).toHaveBeenCalledWith('/api/credits', {
      method: 'GET',
    })
  })

  it('rejects invalid credit balance responses', async () => {
    const request = vi.fn().mockResolvedValue(response(200, {
      companyBalances: { 'silvertree-oris': '500' },
      outletBalances: { 'st-001': -100 },
    }))

    await expect(getCreditBalances(request))
      .rejects.toThrow('Invalid credit balances received from the server.')
  })

  it('requests quotation generation and verifies successful credit allocation', async () => {
    const quotation = {
      reference: 'QT-123456789',
      companies: [],
      totalCredits: '300',
    }

    const allocation = {
      reference: quotation.reference,
      alreadyAllocated: false,
    }

    const request = vi.fn().mockResolvedValue(response(201, {
      quotation,
      allocation,
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '300',
    }, request)).resolves.toEqual(quotation)

    expect(request).toHaveBeenCalledWith('/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId: 'silvertree',
        creditsByOutlet: { 'st-001': '300' },
      }),
    })
  })

  it('rejects a quotation response without successful allocation', async () => {
    const request = vi.fn().mockResolvedValue(response(201, {
      quotation: {
        reference: 'QT-123456789',
        companies: [],
        totalCredits: '300',
      },
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '300',
    }, request)).rejects.toThrow('Invalid credit allocation response from the server.')
  })

  it('rejects an allocation that does not represent a new credit operation', async () => {
    const request = vi.fn().mockResolvedValue(response(201, {
      quotation: {
        reference: 'QT-123456789',
        companies: [],
        totalCredits: '300',
      },
      allocation: {
        reference: 'QT-123456789',
        alreadyAllocated: true,
      },
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '300',
    }, request)).rejects.toThrow('Invalid credit allocation response from the server.')
  })

  it('preserves backend validation errors', async () => {
    const request = vi.fn().mockResolvedValue(response(422, {
      error: 'Correct the invalid SMS credit amounts before generating a quotation.',
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '-1',
    }, request)).rejects.toThrow('Correct the invalid SMS credit amounts')
  })

  it('handles a backend connection failure', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Network failure'))

    await expect(getBusinesses(request)).rejects.toThrow('Unable to connect to the GoSMS server.')
  })

  it('rejects malformed quotation responses', async () => {
    const request = vi.fn().mockResolvedValue(response(201, {
      quotation: { reference: 'QT-123456789' },
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '300',
    }, request)).rejects.toThrow('Invalid quotation received')
  })
})
