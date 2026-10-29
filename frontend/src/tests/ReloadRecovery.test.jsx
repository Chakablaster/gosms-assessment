
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import App from '../App'
import { brands, companies, outlets } from '../../../backend/data/mockData'
import { createQuotationService } from '../../../backend/services/quotationService'
import { createCreditAllocationService } from '../../../backend/services/creditAllocationService'
import { createReloadService } from '../../../backend/services/reloadService'

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

function setupBackend({
  loseFirstResponse = false,
  rejectFirstRequest = false,
  failFirstEmail = false,
} = {}) {
  const quotationService = createQuotationService({ brands, companies, outlets })
  const creditAllocationService = createCreditAllocationService({ companies, outlets })
  const reloadService = createReloadService({ quotationService, creditAllocationService })

  const quotationRequests = []
  const emailRequests = []

  const request = vi.fn(async (url, options = {}) => {
    if (url === '/api/businesses' && options.method === 'GET') {
      return response(200, { brands, companies, outlets })
    }

    if (url === '/api/credits' && options.method === 'GET') {
      return response(200, creditAllocationService.getBalances())
    }

    if (url === '/api/quotations' && options.method === 'POST') {
      const payload = JSON.parse(options.body)
      quotationRequests.push(payload)

      if (rejectFirstRequest) {
        rejectFirstRequest = false

        return response(422, {
          error: 'Quotation validation failed.',
        })
      }

      let result

      try {
        result = reloadService.processReload(payload)
      } catch (error) {
        return response(error.status ?? 500, {
          error: error.message,
        })
      }

      if (loseFirstResponse) {
        loseFirstResponse = false
        throw new Error('Network connection interrupted.')
      }

      return response(result.allocation.alreadyAllocated ? 200 : 201, result)
    }

    if (url === '/api/quotations/email' && options.method === 'POST') {
      emailRequests.push(JSON.parse(options.body))

      if (failFirstEmail) {
        failFirstEmail = false

        return response(502, {
          error: 'Email could not be sent. Please try again.',
        })
      }

      return response(200, {
        status: 'sent',
        recipient: 'client@example.com',
        alreadySent: false,
      })
    }

    return response(404, { error: 'Not found.' })
  })

  vi.stubGlobal('fetch', request)

  return {
    quotationRequests,
    emailRequests,
    getBalances: () => creditAllocationService.getBalances(),
  }
}

async function prepareTopUp(credits = '300') {
  render(<App />)

  await screen.findByRole('button', { name: 'Client Brand' })

  fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
  fireEvent.click(screen.getByRole('option', { name: 'Silvertree Restaurants' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  fireEvent.change(
    screen.getByRole('textbox', {
      name: 'SMS credits for Binjai Park (ST-BP-01)',
    }),
    { target: { value: credits } }
  )
}

async function submitQuotation(buttonName) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: buttonName }))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SMS credit reload recovery', () => {
  it('recovers the original quotation after a lost response without allocating credits twice', async () => {
    const backend = setupBackend({ loseFirstResponse: true })

    await prepareTopUp('300')
    await submitQuotation('Generate Quotation')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to connect to the GoSMS server.'
    )

    expect(screen.getByRole('button', { name: 'Retry Quotation' })).toBeInTheDocument()

    expect(screen.getByRole('textbox', {
      name: 'SMS credits for Binjai Park (ST-BP-01)',
    })).toBeDisabled()

    expect(backend.getBalances().outletBalances['st-001']).toBe('300')
    expect(backend.quotationRequests).toHaveLength(1)
    expect(backend.emailRequests).toHaveLength(0)

    await submitQuotation('Retry Quotation')

    expect(screen.getByRole('heading', {
      name: 'SMS Credit Quotation',
    })).toBeInTheDocument()

    expect(backend.quotationRequests).toHaveLength(2)
    expect(backend.quotationRequests[1].operationId).toBe(
      backend.quotationRequests[0].operationId
    )

    expect(backend.getBalances().outletBalances['st-001']).toBe('300')
    expect(backend.getBalances().companyBalances['silvertree-oris']).toBe('300')
    expect(backend.emailRequests).toHaveLength(1)

    expect(await screen.findByRole('status')).toHaveTextContent(
      'SMS credits have been allocated.'
    )
  })

  it('allows correcting a rejected quotation without allocating failed requests', async () => {
    const backend = setupBackend({ rejectFirstRequest: true })

    await prepareTopUp('300')
    await submitQuotation('Generate Quotation')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Quotation validation failed.'
    )

    expect(backend.getBalances().outletBalances['st-001']).toBe('0')

    const input = screen.getByRole('textbox', {
      name: 'SMS credits for Binjai Park (ST-BP-01)',
    })

    expect(input).toBeEnabled()

    fireEvent.change(input, { target: { value: '200' } })

    await submitQuotation('Generate Quotation')

    expect(screen.getByRole('heading', {
      name: 'SMS Credit Quotation',
    })).toBeInTheDocument()

    expect(backend.quotationRequests).toHaveLength(2)
    expect(backend.quotationRequests[1].operationId).not.toBe(
      backend.quotationRequests[0].operationId
    )

    expect(backend.getBalances().outletBalances['st-001']).toBe('200')
    expect(backend.emailRequests).toHaveLength(1)
  })

  it('retries failed email delivery without repeating quotation generation or credit allocation', async () => {
    const backend = setupBackend({ failFirstEmail: true })

    await prepareTopUp('150')
    await submitQuotation('Generate Quotation')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'SMS credits were allocated.'
    )

    expect(screen.getByRole('button', {
      name: 'Retry Email',
    })).toBeInTheDocument()

    expect(backend.quotationRequests).toHaveLength(1)
    expect(backend.getBalances().outletBalances['st-001']).toBe('150')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry Email' }))
    })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Quotation email sent successfully.'
    )

    expect(backend.emailRequests).toHaveLength(2)
    expect(backend.quotationRequests).toHaveLength(1)
    expect(backend.getBalances().outletBalances['st-001']).toBe('150')
  })
})
