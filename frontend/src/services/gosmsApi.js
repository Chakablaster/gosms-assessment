
async function requestJson(url, options, request) {
  let response

  try {
    response = await request(url, options)
  } catch {
    throw new Error('Unable to connect to the GoSMS server.')
  }

  let data

  try {
    data = await response.json()
  } catch {
    throw new Error('Invalid response from the GoSMS server.')
  }

  if (!response.ok) {
    const error = new Error(
      typeof data?.error === 'string' ? data.error : 'The request could not be completed.'
    )
    error.status = response.status
    throw error
  }

  return data
}

function isCreditBalanceMap(value) {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((credits) => typeof credits === 'string' && /^\d+$/.test(credits))
}

export async function getBusinesses(request = fetch) {
  const data = await requestJson('/api/businesses', { method: 'GET' }, request)

  if (
    !Array.isArray(data?.brands) ||
    !Array.isArray(data?.companies) ||
    !Array.isArray(data?.outlets)
  ) {
    throw new Error('Invalid business data received.')
  }

  return {
    brands: data.brands,
    companies: data.companies,
    outlets: data.outlets,
  }
}

export async function getCreditBalances(request = fetch) {
  const data = await requestJson('/api/credits', { method: 'GET' }, request)

  if (
    !isCreditBalanceMap(data?.companyBalances) ||
    !isCreditBalanceMap(data?.outletBalances)
  ) {
    throw new Error('Invalid credit balances received from the server.')
  }

  return {
    companyBalances: data.companyBalances,
    outletBalances: data.outletBalances,
  }
}

export async function createQuotation(brandId, creditsByOutlet, operationId, request = fetch) {
  const data = await requestJson('/api/quotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId, brandId, creditsByOutlet }),
  }, request)

  if (
    typeof data?.quotation?.reference !== 'string' ||
    !Array.isArray(data.quotation.companies)
  ) {
    throw new Error('Invalid quotation received from the server.')
  }

  if (
    data?.allocation?.reference !== data.quotation.reference ||
    typeof data.allocation.alreadyAllocated !== 'boolean'
  ) {
    throw new Error('Invalid credit allocation response from the server.')
  }

  return data.quotation
}
