import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { brands, companies, outlets } from '../../../backend/data/mockData'
import { createQuotationService } from '../../../backend/services/quotationService'
import { createCreditAllocationService } from '../../../backend/services/creditAllocationService'
import { createReloadService } from '../../../backend/services/reloadService'

// These tests use the real quotation and credit allocation services behind a mocked
// API. That lets us check the actual balances after a failed or repeated request.
// Only the network responses are simulated; Redis and the deployed API are not involved.

function response(status, data) {
  // The frontend only needs these parts of a fetch response for this workflow.
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

function setupApi({ loseFirstResponse = false, rejectFirstRequest = false, failFirstEmail = false } = {}) {
  const quotationService = createQuotationService({ brands, companies, outlets })
  const creditAllocationService = createCreditAllocationService({ companies, outlets })
  const reloadService = createReloadService({ quotationService, creditAllocationService })

  // Keep a record of every quotation request received, including rejected requests.
  // completedReloads is separate because a request can succeed on the server even
  // when the browser never receives its response.
  const quotationRequests = []
  const completedReloads = []
  const emailRequests = []

  const request = vi.fn(async (url, options = {}) => {
    // The app requests the business records and existing balances when it loads.
    // Both responses come from the same data used by the backend services below.
    if (url === '/api/gosms?resource=businesses' && options.method === 'GET') {
      return response(200, { brands, companies, outlets })
    }

    if (url === '/api/gosms?resource=credits' && options.method === 'GET') {
      return response(200, creditAllocationService.getBalances())
    }

    if (url === '/api/gosms?resource=quotations' && options.method === 'POST') {
      const payload = JSON.parse(options.body)
      quotationRequests.push(payload)

      if (rejectFirstRequest) {
        // A 422 response confirms that the server rejected the request.
        // No quotation or allocation is created, so the user can correct
        // the input and submit it as a new operation.
        rejectFirstRequest = false
        return response(422, { error: 'Quotation validation failed.' })
      }

      let result

      try {
        result = reloadService.processReload(payload)
      } catch (error) {
        return response(error.status ?? 500, { error: error.message })
      }

      completedReloads.push(result)

      if (loseFirstResponse) {
        // This is different from rejecting the request above. The server has
        // already allocated the credits, but the connection fails before the
        // browser can confirm what happened.
        //
        // Retrying must therefore use the original operation ID. Sending a new
        // one would make the backend treat the retry as another top up.
        loseFirstResponse = false
        throw new Error('Network connection interrupted.')
      }

      return response(result.allocation.alreadyAllocated ? 200 : 201, result)
    }

    if (url === '/api/gosms?resource=email' && options.method === 'POST') {
      emailRequests.push(JSON.parse(options.body))

      if (failFirstEmail) {
        // Email delivery happens after quotation generation and credit allocation.
        // A failure here should not undo the allocation or cause another one.
        failFirstEmail = false
        return response(502, { error: 'Email could not be sent. Please try again.' })
      }

      return response(200, { status: 'sent' })
    }

    // An unexpected route should fail the test instead of quietly returning
    // a mock response. This also catches tests using outdated API endpoints.
    throw new Error(`Unexpected API request: ${options.method ?? 'GET'} ${url}`)
  })

  vi.stubGlobal('fetch', request)

  return {
    quotationRequests,
    completedReloads,
    emailRequests,
    getBalances: () => creditAllocationService.getBalances(),
  }
}

function creditInput() {
  return screen.getByRole('textbox', {
    name: 'SMS credits for Binjai Park (ST-BP-01)',
  })
}

async function prepareTopUp(credits) {
  // Use the actual screens rather than setting workflow state directly.
  // Keeping the top up to one outlet makes any duplicate allocation obvious
  // when we check its balance after recovery.
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: 'Silvertree Restaurants' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(creditInput(), { target: { value: credits } })
}

afterEach(() => {
  // Restore fetch after each test so the simulated backend cannot affect
  // another frontend test.
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SMS credit reload recovery', () => {
  it('recovers a quotation after a lost response without allocating credits twice', async () => {
    const api = setupApi({ loseFirstResponse: true })
    await prepareTopUp('300')

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to connect to the GoSMS server.'
    )

    // The browser cannot tell whether the server completed this request.
    // It must keep the original amount locked rather than letting the user
    // change the pending allocation while its outcome is uncertain.
    expect(creditInput()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry Quotation' })).toBeInTheDocument()

    // Although the UI reports a connection error, the backend completed
    // the first reload. There should be no email attempt yet because the
    // frontend has not received a confirmed quotation.
    expect(api.quotationRequests).toHaveLength(1)
    expect(api.completedReloads).toHaveLength(1)
    expect(api.getBalances().outletBalances['st-001']).toBe('300')
    expect(api.emailRequests).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Retry Quotation' }))

    expect(await screen.findByRole('heading', {
      name: 'SMS Credit Quotation',
    })).toBeInTheDocument()

    expect(await screen.findByText(
      'Quotation generated and emailed successfully. SMS credits have been allocated.'
    )).toBeInTheDocument()

    // The retry must send exactly the same request. The backend uses its
    // operation ID to recognise the previous allocation and return the
    // original quotation instead of generating a second one.
    expect(api.quotationRequests).toHaveLength(2)
    expect(api.quotationRequests[1]).toEqual(api.quotationRequests[0])
    expect(api.completedReloads[1].quotation).toEqual(api.completedReloads[0].quotation)
    expect(api.completedReloads[1].allocation.alreadyAllocated).toBe(true)

    // Recovering the original quotation also means showing its original
    // reference. A fresh reference here would indicate a new quotation.
    expect(screen.getByText(
      api.completedReloads[0].quotation.reference
    )).toBeInTheDocument()

    // This is the important financial check: two HTTP requests were made,
    // but the outlet and company balances still reflect only one allocation.
    expect(api.getBalances().outletBalances['st-001']).toBe('300')
    expect(api.getBalances().companyBalances['silvertree-oris']).toBe('300')

    // Once the quotation is recovered, email delivery should happen once.
    expect(api.emailRequests).toHaveLength(1)
  })

  it('allows a new quotation after the server rejects the first request', async () => {
    const api = setupApi({ rejectFirstRequest: true })
    await prepareTopUp('300')

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quotation validation failed.'
    )

    // A validation error is a confirmed rejection, unlike the lost response
    // in the previous test. The user should be able to edit the amount.
    expect(creditInput()).toBeEnabled()

    // The rejected request must not produce a quotation, allocate credits,
    // or trigger an email. Otherwise correcting the amount could leave an
    // unnoticed allocation from the original attempt.
    expect(api.quotationRequests).toHaveLength(1)
    expect(api.completedReloads).toHaveLength(0)
    expect(api.getBalances().outletBalances['st-001']).toBe('0')
    expect(api.emailRequests).toHaveLength(0)

    fireEvent.change(creditInput(), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(await screen.findByRole('heading', {
      name: 'SMS Credit Quotation',
    })).toBeInTheDocument()

    expect(await screen.findByText(
      'Quotation generated and emailed successfully. SMS credits have been allocated.'
    )).toBeInTheDocument()

    // Because the first request was explicitly rejected, the corrected
    // submission needs a new operation ID. Reusing the rejected request's
    // pending operation is only appropriate for uncertain network failures.
    expect(api.quotationRequests).toHaveLength(2)
    expect(api.quotationRequests[1].operationId).not.toBe(
      api.quotationRequests[0].operationId
    )
    expect(api.quotationRequests[1].creditsByOutlet['st-001']).toBe('200')

    // Only the corrected amount should reach the account. The original
    // rejected amount must have no effect on the final balance.
    expect(api.completedReloads).toHaveLength(1)
    expect(api.getBalances().outletBalances['st-001']).toBe('200')
    expect(api.emailRequests).toHaveLength(1)
  })

  it('retries failed email delivery without generating another quotation', async () => {
    const api = setupApi({ failFirstEmail: true })
    await prepareTopUp('150')

    fireEvent.click(screen.getByRole('button', { name: 'Generate Quotation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Quotation generated, but the email could not be sent. SMS credits were allocated.'
    )

    // Email failure must be reported separately from quotation generation.
    // The quotation exists and the credits have already been allocated;
    // only delivery to the client needs another attempt.
    expect(screen.getByRole('button', { name: 'Retry Email' })).toBeInTheDocument()
    expect(api.quotationRequests).toHaveLength(1)
    expect(api.emailRequests).toHaveLength(1)
    expect(api.getBalances().outletBalances['st-001']).toBe('150')

    fireEvent.click(screen.getByRole('button', { name: 'Retry Email' }))

    expect(await screen.findByText(
      'Quotation email sent successfully.'
    )).toBeInTheDocument()

    // The second email request must contain the same quotation as the first.
    // Retrying delivery must not create a replacement quotation or change its
    // contents just because the original email failed.
    expect(api.emailRequests).toHaveLength(2)
    expect(api.emailRequests[1]).toEqual(api.emailRequests[0])

    // A successful email retry completes the delivery step only.
    // Quotation generation and credit allocation must still have happened
    // exactly once, even though there were two email attempts.
    expect(api.quotationRequests).toHaveLength(1)
    expect(api.completedReloads).toHaveLength(1)
    expect(api.getBalances().outletBalances['st-001']).toBe('150')
  })
})
