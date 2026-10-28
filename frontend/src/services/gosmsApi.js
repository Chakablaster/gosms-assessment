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
    throw new Error(typeof data?.error === 'string' ? data.error : 'The request could not be completed.')
  }

  return data
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

export async function createQuotation(brandId, creditsByOutlet, request = fetch) {
  const data = await requestJson('/api/quotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId, creditsByOutlet }),
  }, request)

  if (
    !data?.quotation?.reference ||
    !Array.isArray(data.quotation.companies)
  ) {
    throw new Error('Invalid quotation received from the server.')
  }

  return data.quotation
}
