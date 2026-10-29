import { describe, expect, it } from 'vitest'
import { initialWorkflowState, workflowReducer, getActiveRequest, getBrandQuotations, getBrandQuotedCredits, getOutletCurrentCredits } from '../logic/quotationWorkflow'

const silvertree = 'silvertree'
const gordonGrill = 'gordon-grill'
const firstQuotationDate = new Date('2026-10-28T09:00:00.000Z')
const secondQuotationDate = new Date('2026-10-28T09:05:00.000Z')

function update(state, type, details = {}) {
  return workflowReducer(state, { type, brandId: silvertree, ...details })
}

function makeQuotation(creditsByOutlet, date, { brandId = silvertree, companyId = 'silvertree-oris' } = {}) {
  const allocatedOutlets = Object.entries(creditsByOutlet).map(([outletId, credits]) => ({
    outletId,
    credits: String(credits),
  }))
  const totalCredits = allocatedOutlets.reduce((total, outlet) => total + BigInt(outlet.credits), 0n).toString()

  return {
    reference: `QT-${date.getTime()}`,
    generatedAt: date.toISOString(),
    brandId,
    totalCredits,
    companies: [{ companyId, outlets: allocatedOutlets, totalCredits }],
  }
}

function completeDraft(state, creditsByOutlet, date, details = {}) {
  const brandId = details.brandId ?? silvertree

  // Record the entered amounts before completing the draft. A successful quotation
  // is an event in the workflow; it should not appear without an existing draft.
  for (const [outletId, credits] of Object.entries(creditsByOutlet)) {
    state = update(state, 'SET_CREDIT', { brandId, outletId, value: String(credits) })
  }

  return update(state, 'GENERATION_SUCCEEDED', {
    brandId,
    quotation: makeQuotation(creditsByOutlet, date, details),
  })
}

describe('quotation workflow', () => {
  it('keeps the same draft when a brand is opened again', () => {
    const opened = update(initialWorkflowState, 'OPEN_BRAND')
    const reopened = update(opened, 'OPEN_BRAND')

    expect(reopened).toBe(opened)
    expect(getActiveRequest(opened, silvertree)).toMatchObject({
      status: 'draft',
      creditsByOutlet: {},
      email: { status: 'not_sent', error: null },
    })
    expect(getBrandQuotations(opened, silvertree)).toEqual([])
  })

  it('keeps draft amounts editable without creating unnecessary state changes', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '100' })
    const unchanged = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '100' })
    const edited = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '150' })

    expect(unchanged).toBe(state)
    expect(getActiveRequest(edited, silvertree).creditsByOutlet['st-001']).toBe('150')
    expect(getActiveRequest(state, silvertree).creditsByOutlet['st-001']).toBe('100')
  })

  it('locks a completed request so its credit amounts cannot be edited', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    const edited = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '200' })

    // Once credits have been quoted, changing them must require a new request.
    expect(edited).toBe(state)
    expect(getActiveRequest(state, silvertree).status).toBe('generated')
    expect(getActiveRequest(state, silvertree).creditsByOutlet['st-001']).toBe('100')
    expect(getBrandQuotedCredits(state, silvertree)).toBe(100n)
  })

  it('adds completed quotations together and lists the newest one first', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100', 'st-002': '200' }, firstQuotationDate)
    const firstRequest = getActiveRequest(state, silvertree)
    state = update(state, 'START_NEW')
    state = completeDraft(state, { 'st-001': '50' }, secondQuotationDate)
    const secondRequest = getActiveRequest(state, silvertree)

    // The displayed credits come from completed frontend quotations, not a live
    // balance read from the backend. An unfinished draft must never be counted.
    expect(getOutletCurrentCredits(state, silvertree)).toEqual({ 'st-001': 150n, 'st-002': 200n })
    expect(getBrandQuotedCredits(state, silvertree)).toBe(350n)
    expect(getBrandQuotations(state, silvertree).map((request) => request.id)).toEqual([
      secondRequest.id,
      firstRequest.id,
    ])
  })

  it('does not count draft credits, even after a previous quotation exists', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '100' })

    expect(getOutletCurrentCredits(state, silvertree)).toEqual({})
    expect(getBrandQuotedCredits(state, silvertree)).toBe(0n)

    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    state = update(state, 'START_NEW')
    state = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '200' })

    expect(getOutletCurrentCredits(state, silvertree)).toEqual({ 'st-001': 100n })
    expect(getBrandQuotedCredits(state, silvertree)).toBe(100n)
    expect(getBrandQuotations(state, silvertree)).toHaveLength(1)
  })

  it('starts an empty draft after generation without losing the previous quotation', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    const completed = getActiveRequest(state, silvertree)
    state = update(state, 'START_NEW')

    const nextDraft = getActiveRequest(state, silvertree)
    expect(nextDraft.id).not.toBe(completed.id)
    expect(nextDraft).toMatchObject({
      status: 'draft',
      creditsByOutlet: {},
      quotation: null,
      email: { status: 'not_sent', error: null },
    })
    expect(state.requestsById[completed.id]).toEqual(completed)
    expect(getBrandQuotations(state, silvertree).map((request) => request.id)).toEqual([completed.id])
  })

  it('replaces an abandoned draft instead of keeping it as quotation history', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '100' })
    const abandonedId = getActiveRequest(state, silvertree).id
    state = update(state, 'START_NEW')

    // A draft was never generated, so there is nothing to preserve in history.
    expect(state.requestsById[abandonedId]).toBeUndefined()
    expect(getActiveRequest(state, silvertree).id).not.toBe(abandonedId)
    expect(getActiveRequest(state, silvertree).creditsByOutlet).toEqual({})
    expect(getBrandQuotations(state, silvertree)).toEqual([])
  })

  it('preserves an earlier quotation when another one is generated', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    const first = getActiveRequest(state, silvertree)
    state = update(state, 'START_NEW')
    state = completeDraft(state, { 'st-001': '50' }, secondQuotationDate)

    expect(state.requestsById[first.id]).toEqual(first)
    expect(getBrandQuotations(state, silvertree)).toHaveLength(2)
    expect(getBrandQuotedCredits(state, silvertree)).toBe(150n)
  })

  it('ignores a second generation event for an already completed request', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    const repeated = update(state, 'GENERATION_SUCCEEDED', {
      quotation: makeQuotation({ 'st-001': '200' }, secondQuotationDate),
    })

    // A duplicate event must not rewrite history or double the quoted credits.
    expect(repeated).toBe(state)
    expect(getBrandQuotations(state, silvertree)).toHaveLength(1)
    expect(getBrandQuotedCredits(state, silvertree)).toBe(100n)
  })

  it('does not complete a draft if the generation event has no quotation', () => {
    const state = update(initialWorkflowState, 'OPEN_BRAND')
    const unchanged = update(state, 'GENERATION_SUCCEEDED', { quotation: null })

    expect(unchanged).toBe(state)
    expect(getActiveRequest(state, silvertree).status).toBe('draft')
    expect(getBrandQuotations(state, silvertree)).toEqual([])
  })

  it('remembers separate draft inputs when switching between brands', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = update(state, 'SET_CREDIT', { outletId: 'st-001', value: '100' })
    state = update(state, 'OPEN_BRAND', { brandId: gordonGrill })
    state = update(state, 'SET_CREDIT', { brandId: gordonGrill, outletId: 'gg-001', value: '75' })
    state = update(state, 'OPEN_BRAND')

    // Switching brands should restore each draft, not carry the other brand's inputs across.
    expect(getActiveRequest(state, silvertree).creditsByOutlet).toEqual({ 'st-001': '100' })
    expect(getActiveRequest(state, gordonGrill).creditsByOutlet).toEqual({ 'gg-001': '75' })
    expect(getActiveRequest(state, silvertree).id).not.toBe(getActiveRequest(state, gordonGrill).id)
  })

  it('keeps completed quotation totals and history separate for each brand', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    state = update(state, 'OPEN_BRAND', { brandId: gordonGrill })
    state = completeDraft(state, { 'gg-001': '75' }, secondQuotationDate, {
      brandId: gordonGrill,
      companyId: 'gordon-dining',
    })

    expect(getOutletCurrentCredits(state, silvertree)).toEqual({ 'st-001': 100n })
    expect(getOutletCurrentCredits(state, gordonGrill)).toEqual({ 'gg-001': 75n })
    expect(getBrandQuotedCredits(state, silvertree)).toBe(100n)
    expect(getBrandQuotedCredits(state, gordonGrill)).toBe(75n)
    expect(getBrandQuotations(state, silvertree)).toHaveLength(1)
    expect(getBrandQuotations(state, gordonGrill)).toHaveLength(1)
  })

  it('does not start email delivery for a draft or an unknown request', () => {
    const state = update(initialWorkflowState, 'OPEN_BRAND')
    const requestId = getActiveRequest(state, silvertree).id

    expect(update(state, 'EMAIL_SEND_STARTED', { requestId })).toBe(state)
    expect(update(state, 'EMAIL_SEND_SUCCEEDED', { requestId })).toBe(state)
    expect(update(state, 'EMAIL_SEND_STARTED', { requestId: 'missing-request' })).toBe(state)
    expect(getActiveRequest(state, silvertree).email.status).toBe('not_sent')
  })

  it('records successful email delivery and prevents sending the same quotation again', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    const requestId = getActiveRequest(state, silvertree).id
    state = update(state, 'EMAIL_SEND_STARTED', { requestId })

    expect(getActiveRequest(state, silvertree).email).toEqual({ status: 'sending', error: null })
    expect(update(state, 'EMAIL_SEND_STARTED', { requestId })).toBe(state)

    state = update(state, 'EMAIL_SEND_SUCCEEDED', { requestId })

    // Once sent, a stale failure or another send event must not overwrite success.
    expect(getActiveRequest(state, silvertree).email).toEqual({ status: 'sent', error: null })
    expect(update(state, 'EMAIL_SEND_STARTED', { requestId })).toBe(state)
    expect(update(state, 'EMAIL_SEND_FAILED', { requestId, error: 'Late error' })).toBe(state)
  })

  it('allows email delivery to be retried after a failure', () => {
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': '100' }, firstQuotationDate)
    const requestId = getActiveRequest(state, silvertree).id
    const quotation = getActiveRequest(state, silvertree).quotation
    state = update(state, 'EMAIL_SEND_STARTED', { requestId })
    state = update(state, 'EMAIL_SEND_FAILED', { requestId, error: 'Email service unavailable.' })

    expect(getActiveRequest(state, silvertree).email).toEqual({
      status: 'failed',
      error: 'Email service unavailable.',
    })

    state = update(state, 'EMAIL_SEND_STARTED', { requestId })
    expect(getActiveRequest(state, silvertree).email).toEqual({ status: 'sending', error: null })

    state = update(state, 'EMAIL_SEND_SUCCEEDED', { requestId })

    // Retrying delivery changes only the email state. It must not replace the
    // quotation or increase the credits recorded for that brand.
    expect(getActiveRequest(state, silvertree).email).toEqual({ status: 'sent', error: null })
    expect(getActiveRequest(state, silvertree).quotation).toEqual(quotation)
    expect(getBrandQuotations(state, silvertree)).toHaveLength(1)
    expect(getBrandQuotedCredits(state, silvertree)).toBe(100n)
  })

  it('keeps large quoted credit totals exact', () => {
    const maximumSafeCredits = Number.MAX_SAFE_INTEGER.toString()
    let state = update(initialWorkflowState, 'OPEN_BRAND')
    state = completeDraft(state, { 'st-001': maximumSafeCredits, 'st-002': maximumSafeCredits }, firstQuotationDate)

    // Each outlet amount is within JavaScript's safe integer range, but their
    // combined total is not. The workflow sums these amounts with BigInt.
    expect(getOutletCurrentCredits(state, silvertree)).toEqual({
      'st-001': BigInt(maximumSafeCredits),
      'st-002': BigInt(maximumSafeCredits),
    })
    expect(getBrandQuotedCredits(state, silvertree)).toBe(BigInt(maximumSafeCredits) * 2n)
  })
})
