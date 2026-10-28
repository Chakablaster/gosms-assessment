export function validateCreditAmount(value) {
  if (value.trim() === '') return null

  if (!/^\d+$/.test(value)) {
    return 'Enter a whole number of SMS credits (0 or more).'
  }

  if (!Number.isSafeInteger(Number(value))) {
    return 'The credit amount is too large.'
  }

  return null
}

export function calculateTotalCredits(outlets, creditsByOutlet) {
  return outlets.reduce((total, outlet) => {
    const value = creditsByOutlet[outlet.id] ?? '0'

    if (validateCreditAmount(value) || value.trim() === '') {
      return total
    }

    return total + BigInt(value)
  }, 0n)
}
