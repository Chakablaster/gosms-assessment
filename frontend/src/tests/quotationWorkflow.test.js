import { describe, expect, it } from 'vitest'
import { initialWorkflowState, workflowReducer, getActiveRequest, getBrandQuotations, getBrandQuotedCredits, getOutletCurrentCredits } from '../logic/quotationWorkflow'

const brandId = 'silvertree'
const otherBrandId = 'gordon-grill'

function reduce(state, type, details = {}) {
  return workflowReducer(state, { type, brandId, ...details })
}

function generate(state, creditsByOutlet, timestamp, companyId = 'silvertree-oris') {
  const outlets = Object.entries(creditsByOutlet).map(([outletId, credits]) => ({
    outletId,
    credits: String(credits),
  }))
  const quotation = {
    reference: `QT-${timestamp}`,
    generatedAt: new Date(timestamp).toISOString(),
    totalCredits: outlets.reduce((sum, outlet) => sum + BigInt(outlet.credits), 0n).toString(),
    companies: [{ companyId, outlets }],
  }
  return reduce(state, 'GENERATION_SUCCEEDED', { quotation })
}

describe('quotation workflow', () => {
  it('creates one draft per brand without duplicating it on navigation', () => {
    const opened = reduce(initialWorkflowState, 'OPEN_BRAND')
    expect(reduce(opened, 'OPEN_BRAND')).toBe(opened)
    expect(getActiveRequest(opened, brandId).status).toBe('draft')
    expect(getOutletCurrentCredits(opened, brandId)).toEqual({})
  })

  it('allows entering credits only while a request is a draft', () => {
    let state = reduce(initialWorkflowState, 'OPEN_BRAND')
    state = reduce(state, 'SET_CREDIT', { outletId: 'st-001', value: '7' })
    expect(getActiveRequest(state, brandId).creditsByOutlet['st-001']).toBe('7')
    state = generate(state, { 'st-001': 7 }, 1793180000000)
    const attemptToEdit = reduce(state, 'SET_CREDIT', { outletId: 'st-001', value: '9' })
    expect(attemptToEdit).toBe(state)
    expect(getActiveRequest(state, brandId).creditsByOutlet['st-001']).toBe('7')
    expect(getBrandQuotations(state, brandId)).toHaveLength(1)
  })

  it('adds independent generated quotations to the correct outlets', () => {
    let state = reduce(initialWorkflowState, 'OPEN_BRAND')
    state = generate(state, { 'st-001': 7, 'st-002': 4 }, 1793180000000)
    state = reduce(state, 'START_NEW')
    state = generate(state, { 'st-001': 5, 'st-003': 2 }, 1793180000001)

    expect(getOutletCurrentCredits(state, brandId)).toEqual({
      'st-001': 12n,
      'st-002': 4n,
      'st-003': 2n,
    })
    expect(getBrandQuotedCredits(state, brandId)).toBe(18n)
  })

  it('does not include unfinished drafts in current credits', () => {
    let state = reduce(initialWorkflowState, 'OPEN_BRAND')
    state = reduce(state, 'SET_CREDIT', { outletId: 'st-001', value: '7' })
    expect(getOutletCurrentCredits(state, brandId)).toEqual({})
    state = generate(state, { 'st-001': 7 }, 1793180000000)
    state = reduce(state, 'START_NEW')
    state = reduce(state, 'SET_CREDIT', { outletId: 'st-001', value: '5' })
    expect(getOutletCurrentCredits(state, brandId)['st-001']).toBe(7n)
  })

  it('starts a separate editable request with zero credits and preserves history', () => {
    let state = reduce(initialWorkflowState, 'OPEN_BRAND')
    state = reduce(state, 'SET_CREDIT', { outletId: 'st-001', value: '7' })
    state = generate(state, { 'st-001': 7 }, 1793180000000)
    const previousRequest = getActiveRequest(state, brandId)
    state = reduce(state, 'START_NEW')

    expect(getActiveRequest(state, brandId).id).not.toBe(previousRequest.id)
    expect(getActiveRequest(state, brandId).status).toBe('draft')
    expect(getActiveRequest(state, brandId).creditsByOutlet).toEqual({})
    expect(getBrandQuotations(state, brandId)).toHaveLength(1)
    expect(state.requestsById[previousRequest.id]).toEqual(previousRequest)
  })

  it('never creates a revision or changes a previously generated quotation', () => {
    let state = reduce(initialWorkflowState, 'OPEN_BRAND')
    state = generate(state, { 'st-001': 7 }, 1793180000000)
    const first = getActiveRequest(state, brandId)
    state = reduce(state, 'START_NEW')
    state = generate(state, { 'st-001': 9 }, 1793180000001)

    expect(state.requestsById[first.id]).toEqual(first)
    expect(getBrandQuotations(state, brandId).map((request) => request.status)).toEqual([
      'generated', 'generated',
    ])
    expect(getBrandQuotedCredits(state, brandId)).toBe(16n)
  })

  it('ignores repeated generation for the same request', () => {
    let state = reduce(initialWorkflowState, 'OPEN_BRAND')
    state = generate(state, { 'st-001': 7 }, 1793180000000)
    const repeated = generate(state, { 'st-001': 7 }, 1793180000001)
    expect(repeated).toBe(state)
    expect(getBrandQuotedCredits(state, brandId)).toBe(7n)
    expect(getBrandQuotations(state, brandId)).toHaveLength(1)
  })

  it('maintains separate histories and credits for each brand', () => {
    let state = reduce(initialWorkflowState, 'OPEN_BRAND')
    state = generate(state, { 'st-001': 7 }, 1793180000000)
    state = reduce(state, 'OPEN_BRAND', { brandId: otherBrandId })
    state = reduce(state, 'GENERATION_SUCCEEDED', {
      brandId: otherBrandId,
      quotation: {
        reference: 'QT-1793180000001',
        generatedAt: new Date(1793180000001).toISOString(),
        totalCredits: '20',
        companies: [{ companyId: 'gordon-dining', outlets: [{ outletId: 'gg-001', credits: '20' }] }],
      },
    })

    expect(getOutletCurrentCredits(state, brandId)).toEqual({ 'st-001': 7n })
    expect(getOutletCurrentCredits(state, otherBrandId)).toEqual({ 'gg-001': 20n })
    expect(getBrandQuotedCredits(state, brandId)).toBe(7n)
    expect(getBrandQuotedCredits(state, otherBrandId)).toBe(20n)
  })
})
