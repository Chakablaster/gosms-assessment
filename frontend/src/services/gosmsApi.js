// Local development endpoints are intentionally inactive:
// /api/businesses
// /api/credits
// /api/quotations
// /api/quotations/history

function apiUrl(resource) {
  return `/api/gosms?resource=${resource}`
}

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

function isHistoryCountMap(value) {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((count) => Number.isSafeInteger(count) && count >= 0)
}

export async function getBusinesses(request = fetch) {
  const data = await requestJson(apiUrl('businesses'), { method: 'GET' }, request)

  if (
    !Array.isArray(data?.brands) ||
    !Array.isArray(data?.companies) ||
    !Array.isArray(data?.outlets)
  ) {
    throw new Error('Invalid business data received.')
  }

  return { brands: data.brands, companies: data.companies, outlets: data.outlets }
}

export async function getCreditBalances(request = fetch) {
  const data = await requestJson(apiUrl('credits'), { method: 'GET' }, request)

  if (
    !isCreditBalanceMap(data?.companyBalances) ||
    !isCreditBalanceMap(data?.outletBalances) ||
    (data.historyCountByBrand !== undefined && !isHistoryCountMap(data.historyCountByBrand))
  ) {
    throw new Error('Invalid credit balances received from the server.')
  }

  return {
    companyBalances: data.companyBalances,
    outletBalances: data.outletBalances,
    ...(data.historyCountByBrand !== undefined
      ? { historyCountByBrand: data.historyCountByBrand }
      : {}),
  }
}

export async function getQuotationHistory(brandId, request = fetch) {
  const data = await requestJson(
    `${apiUrl('history')}&brandId=${encodeURIComponent(brandId)}`,
    { method: 'GET' },
    request
  )

  if (
    !Array.isArray(data?.requests) ||
    data.requests.some((item) =>
      typeof item?.id !== 'string' ||
      item.brandId !== brandId ||
      item.status !== 'generated' ||
      typeof item.quotation?.reference !== 'string' ||
      typeof item.quotation?.generatedAt !== 'string' ||
      typeof item.quotation?.totalCredits !== 'string' ||
      !/^\d+$/.test(item.quotation.totalCredits) ||
      !Array.isArray(item.quotation.companies)
    )
  ) {
    throw new Error('Invalid quotation history received from the server.')
  }

  return data.requests
}

export async function createQuotation(brandId, creditsByOutlet, operationId, request = fetch) {
  const data = await requestJson(
    apiUrl('quotations'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId, brandId, creditsByOutlet }),
    },
    request
  )

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
