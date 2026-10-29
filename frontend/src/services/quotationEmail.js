export async function sendQuotationEmail(quotation, request = fetch) {
  let response

  try {
    const url = import.meta.env.PROD
      ? '/api/gosms?resource=email'
      : '/api/quotations/email'

    response = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotation }),
    })
  } catch {
    throw new Error('Email service is unavailable. Please try again.')
  }

  let result

  try {
    result = await response.json()
  } catch {
    throw new Error('Email service returned an invalid response.')
  }

  if (!response.ok || result.status !== 'sent') {
    throw new Error(result.error || 'Email could not be sent. Please try again.')
  }

  return result
}
