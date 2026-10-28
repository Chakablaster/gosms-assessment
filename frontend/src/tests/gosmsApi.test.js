import { describe, expect, it, vi } from 'vitest'
import { getBusinesses, createQuotation } from '../services/gosmsApi'

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

  it('requests quotation generation from the backend', async () => {
    const quotation = {
      reference: 'QT-123456789',
      companies: [],
      totalCredits: '300',
    }

    const request = vi.fn().mockResolvedValue(response(201, { quotation }))

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
