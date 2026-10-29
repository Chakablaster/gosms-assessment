
import { describe, expect, it, vi } from 'vitest'
import { getBusinesses, getCreditBalances, createQuotation } from '../services/gosmsApi'

const operationId = 'reload-operation-001'

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

  it('sends the operation identifier with quotation generation', async () => {
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
    }, operationId, request)).resolves.toEqual(quotation)

    expect(request).toHaveBeenCalledWith('/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId,
        brandId: 'silvertree',
        creditsByOutlet: { 'st-001': '300' },
      }),
    })
  })

  it('accepts a previously allocated quotation returned by an operation retry', async () => {
    const quotation = {
      reference: 'QT-123456789',
      companies: [],
      totalCredits: '300',
    }

    const request = vi.fn().mockResolvedValue(response(200, {
      quotation,
      allocation: {
        reference: quotation.reference,
        alreadyAllocated: true,
      },
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '300',
    }, operationId, request)).resolves.toEqual(quotation)
  })

  it('rejects a quotation response without allocation confirmation', async () => {
    const request = vi.fn().mockResolvedValue(response(201, {
      quotation: {
        reference: 'QT-123456789',
        companies: [],
        totalCredits: '300',
      },
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '300',
    }, operationId, request)).rejects.toThrow('Invalid credit allocation response from the server.')
  })

  it('rejects allocation confirmation with a mismatched reference', async () => {
    const request = vi.fn().mockResolvedValue(response(201, {
      quotation: {
        reference: 'QT-123456789',
        companies: [],
        totalCredits: '300',
      },
      allocation: {
        reference: 'QT-987654321',
        alreadyAllocated: false,
      },
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '300',
    }, operationId, request)).rejects.toThrow('Invalid credit allocation response from the server.')
  })

  it('preserves backend validation errors', async () => {
    const request = vi.fn().mockResolvedValue(response(422, {
      error: 'Correct the invalid SMS credit amounts before generating a quotation.',
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '-1',
    }, operationId, request)).rejects.toThrow('Correct the invalid SMS credit amounts')
  })

  it('preserves conflict status for reused operation identifiers', async () => {
    const request = vi.fn().mockResolvedValue(response(409, {
      error: 'This top up operation has already been processed with different details.',
    }))

    await expect(createQuotation('silvertree', {
      'st-001': '500',
    }, operationId, request)).rejects.toMatchObject({
      status: 409,
      message: 'This top up operation has already been processed with different details.',
    })
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
    }, operationId, request)).rejects.toThrow('Invalid quotation received')
  })
})
