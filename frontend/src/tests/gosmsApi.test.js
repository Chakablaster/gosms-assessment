import { describe, expect, it, vi } from 'vitest'
import { getBusinesses, getCreditBalances, getQuotationHistory, createQuotation } from '../services/gosmsApi'

const brandId = 'silvertree'
const operationId = 'silvertree-reload-001'
const creditsByOutlet = { 'st-001': '300' }
const generatedAt = '2026-10-28T09:00:00.000Z'

const businessData = {
  brands: [{ id: brandId, name: 'Silvertree Restaurants' }],
  companies: [{ id: 'silvertree-oris', name: 'Silvertree Oris Sdn Bhd' }],
  outlets: [{
    id: 'st-001',
    brandId,
    companyId: 'silvertree-oris',
    name: 'Binjai Park',
    outletCode: 'ST-BP-01',
  }],
}

const balances = {
  companyBalances: { 'silvertree-oris': '300' },
  outletBalances: { 'st-001': '300' },
}

const quotation = {
  reference: `QT-${new Date(generatedAt).getTime()}`,
  generatedAt,
  brandId,
  brandName: 'Silvertree Restaurants',
  totalCredits: '300',
  companies: [{
    companyId: 'silvertree-oris',
    companyName: 'Silvertree Oris Sdn Bhd',
    totalCredits: '300',
    outlets: [{
      outletId: 'st-001',
      outletName: 'Binjai Park',
      outletCode: 'ST-BP-01',
      credits: '300',
    }],
  }],
}

const savedRequest = { id: operationId, brandId, status: 'generated', quotation }

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

function submitQuotation(request) {
  return createQuotation(brandId, creditsByOutlet, operationId, request)
}

describe('GoSMS API service', () => {
  // Check that business data is fetched using the current API route and returned
  // intact. The brand selector and outlet table both depend on these records.
  it('loads the available brands, companies and outlets', async () => {
    const request = vi.fn().mockResolvedValue(response(200, businessData))

    await expect(getBusinesses(request)).resolves.toEqual(businessData)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/gosms?resource=businesses', { method: 'GET' })
  })

  // Check that the business response contains all three required arrays.
  // Rendering an incomplete dataset could leave outlets without their companies.
  it('rejects incomplete business data', async () => {
    const request = vi.fn().mockResolvedValue(response(200, { ...businessData, companies: null }))

    await expect(getBusinesses(request)).rejects.toThrow('Invalid business data received.')
  })

  // Check that company and outlet balances are read as separate maps of strings.
  // The top up screen needs both views without losing precision when displaying credits.
  it('loads the current credit balances', async () => {
    const request = vi.fn().mockResolvedValue(response(200, balances))

    await expect(getCreditBalances(request)).resolves.toEqual(balances)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/gosms?resource=credits', { method: 'GET' })
  })

  // Check that the API preserves quotation counts when the backend supplies them.
  // Saved counts must survive the API layer, including quotations from earlier sessions.
  it('accepts quotation history counts alongside credit balances', async () => {
    const data = { ...balances, historyCountByBrand: { silvertree: 2, 'gordon-grill': 0 } }
    const request = vi.fn().mockResolvedValue(response(200, data))

    await expect(getCreditBalances(request)).resolves.toEqual(data)
  })

  // Check that missing balance maps, negative amounts and non-string amounts are rejected.
  // Invalid stored values must not be displayed as trustworthy account balances.
  it('rejects malformed credit balances', async () => {
    const invalidResponses = [
      { ...balances, companyBalances: null },
      { ...balances, outletBalances: { 'st-001': -100 } },
      { ...balances, outletBalances: { 'st-001': '-100' } },
    ]

    for (const data of invalidResponses) {
      const request = vi.fn().mockResolvedValue(response(200, data))
      await expect(getCreditBalances(request)).rejects.toThrow('Invalid credit balances received from the server.')
    }
  })

  // Check that history counts are non-negative whole numbers, not strings or decimals.
  // A bad count should not be used to indicate how many quotations exist.
  it('rejects invalid quotation history counts', async () => {
    const invalidCounts = [{ silvertree: -1 }, { silvertree: '2' }, { silvertree: 1.5 }, []]

    for (const historyCountByBrand of invalidCounts) {
      const request = vi.fn().mockResolvedValue(response(200, { ...balances, historyCountByBrand }))
      await expect(getCreditBalances(request)).rejects.toThrow('Invalid credit balances received from the server.')
    }
  })

  // Check that History requests go to the selected brand's endpoint and return its records.
  // The frontend needs saved quotations from earlier sessions, not just local state.
  it('loads saved quotation history for a brand', async () => {
    const request = vi.fn().mockResolvedValue(response(200, { requests: [savedRequest] }))

    await expect(getQuotationHistory(brandId, request)).resolves.toEqual([savedRequest])
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/gosms?resource=history&brandId=silvertree', { method: 'GET' })
  })

  // Check that an empty history is accepted as a normal result.
  // A brand that has never had a top up should show an empty history, not an error.
  it('accepts a brand with no saved quotations', async () => {
    const request = vi.fn().mockResolvedValue(response(200, { requests: [] }))

    await expect(getQuotationHistory(brandId, request)).resolves.toEqual([])
  })

  // Check that history data must contain a requests array.
  // An unexpected response shape must not be treated as an empty saved history.
  it('rejects a malformed quotation history response', async () => {
    const request = vi.fn().mockResolvedValue(response(200, { requests: null }))

    await expect(getQuotationHistory(brandId, request)).rejects.toThrow('Invalid quotation history received from the server.')
  })

  // Check that history entries belong to the requested brand and represent completed
  // quotations with usable details. Bad records must not appear as valid history.
  it('rejects invalid or unrelated saved quotation entries', async () => {
    const invalidRequests = [
      { ...savedRequest, brandId: 'gordon-grill' },
      { ...savedRequest, status: 'draft' },
      { ...savedRequest, quotation: { ...quotation, totalCredits: '-300' } },
      { ...savedRequest, quotation: { ...quotation, companies: null } },
    ]

    for (const saved of invalidRequests) {
      const request = vi.fn().mockResolvedValue(response(200, { requests: [saved] }))
      await expect(getQuotationHistory(brandId, request)).rejects.toThrow('Invalid quotation history received from the server.')
    }
  })

  // Check that a history request preserves the server's error and status.
  // A temporary history outage must be distinguishable from a brand with no quotations.
  it('reports a backend error while loading history', async () => {
    const request = vi.fn().mockResolvedValue(response(503, { error: 'Quotation history is unavailable.' }))

    await expect(getQuotationHistory(brandId, request)).rejects.toMatchObject({
      status: 503,
      message: 'Quotation history is unavailable.',
    })
  })

  // Check that generation sends the brand, amounts and operation ID to the right endpoint.
  // The backend uses the operation ID to recognise retries and avoid duplicate allocations.
  it('submits a quotation request and accepts allocation confirmation', async () => {
    const allocation = { reference: quotation.reference, alreadyAllocated: false }
    const request = vi.fn().mockResolvedValue(response(201, { quotation, allocation }))

    await expect(submitQuotation(request)).resolves.toEqual(quotation)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/gosms?resource=quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId, brandId, creditsByOutlet }),
    })
  })

  // Check that the service accepts an already allocated response for the same quotation.
  // A retry after a lost connection is successful without adding the credits again.
  it('accepts the original quotation returned for a retry', async () => {
    const allocation = { reference: quotation.reference, alreadyAllocated: true }
    const request = vi.fn().mockResolvedValue(response(200, { quotation, allocation }))

    await expect(submitQuotation(request)).resolves.toEqual(quotation)
  })

  // Check that a response without the necessary quotation fields is rejected.
  // The UI cannot display a complete quotation if its company breakdown is missing.
  it('rejects an incomplete generated quotation', async () => {
    const request = vi.fn().mockResolvedValue(response(201, {
      quotation: { reference: quotation.reference },
      allocation: { reference: quotation.reference, alreadyAllocated: false },
    }))

    await expect(submitQuotation(request)).rejects.toThrow('Invalid quotation received from the server.')
  })

  // Check that a quotation alone does not count as a completed top up.
  // The frontend must receive confirmation that the allocation step succeeded.
  it('rejects a quotation without allocation confirmation', async () => {
    const request = vi.fn().mockResolvedValue(response(201, { quotation }))

    await expect(submitQuotation(request)).rejects.toThrow('Invalid credit allocation response from the server.')
  })

  // Check that the allocation confirmation refers to the quotation being returned.
  // Otherwise the frontend could show one quotation while another received credits.
  it('rejects an allocation reference that does not match the quotation', async () => {
    const allocation = { reference: 'QT-other', alreadyAllocated: false }
    const request = vi.fn().mockResolvedValue(response(201, { quotation, allocation }))

    await expect(submitQuotation(request)).rejects.toThrow('Invalid credit allocation response from the server.')
  })

  // Check that alreadyAllocated is a boolean, rather than a string or missing value.
  // The API contract requires an explicit flag, not an ambiguous status string.
  it('rejects an invalid allocation status', async () => {
    const allocation = { reference: quotation.reference, alreadyAllocated: 'false' }
    const request = vi.fn().mockResolvedValue(response(201, { quotation, allocation }))

    await expect(submitQuotation(request)).rejects.toThrow('Invalid credit allocation response from the server.')
  })

  // Check that a validation error from the backend reaches the caller unchanged.
  // The user should see why the requested credits were refused, not a generic failure.
  it('preserves backend validation errors and their status', async () => {
    const message = 'Correct the invalid SMS credit amounts before generating a quotation.'
    const request = vi.fn().mockResolvedValue(response(422, { error: message }))

    await expect(submitQuotation(request)).rejects.toMatchObject({ status: 422, message })
  })

  // Check that reusing an operation ID with different details produces a conflict.
  // The frontend must keep the 409 status so this is not mistaken for an editable input error.
  it('preserves conflicts for reused operation IDs', async () => {
    const message = 'This top up operation has already been processed with different details.'
    const request = vi.fn().mockResolvedValue(response(409, { error: message }))

    await expect(submitQuotation(request)).rejects.toMatchObject({ status: 409, message })
  })

  // Check that a failed network request becomes a connection error.
  // When no response arrives, the UI needs to treat the outcome as uncertain.
  it('reports a network failure', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Connection dropped.'))

    await expect(getBusinesses(request)).rejects.toThrow('Unable to connect to the GoSMS server.')
  })

  // Check that an unreadable JSON response is reported separately from a connection failure.
  // A successful HTTP status does not mean the server sent usable data.
  it('rejects a response that cannot be parsed as JSON', async () => {
    const request = vi.fn().mockResolvedValue({
      ...response(200, null),
      json: async () => { throw new SyntaxError('Invalid JSON.') },
    })

    await expect(getBusinesses(request)).rejects.toThrow('Invalid response from the GoSMS server.')
  })

  // Check the fallback message for an HTTP error with no explanation in its body.
  // The caller still needs an error and the original status to handle the failure.
  it('provides a fallback message when the backend omits an error', async () => {
    const request = vi.fn().mockResolvedValue(response(503, {}))

    await expect(submitQuotation(request)).rejects.toMatchObject({
      status: 503,
      message: 'The request could not be completed.',
    })
  })
})
