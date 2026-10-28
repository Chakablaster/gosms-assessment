import { validateCreditAmount, calculateTotalCredits } from './credits.js'

export function generateQuotation(brand, outlets, creditsByOutlet, generatedAt = new Date()) {
  if (!brand || outlets.length === 0) {
    return { quotation: null, error: 'Select a brand with outlets before generating a quotation.' }
  }

  if (outlets.some((outlet) => validateCreditAmount(creditsByOutlet[outlet.id] ?? '0'))) {
    return { quotation: null, error: 'Correct the invalid SMS credit amounts before generating a quotation.' }
  }

  const allocatedOutlets = outlets.filter((outlet) => {
    const value = creditsByOutlet[outlet.id] ?? '0'
    return value.trim() !== '' && BigInt(value) > 0n
  })

  if (allocatedOutlets.length === 0) {
    return { quotation: null, error: 'Allocate at least 1 SMS credit to generate a quotation.' }
  }

  const companies = new Map()

  for (const outlet of allocatedOutlets) {
    const credits = BigInt(creditsByOutlet[outlet.id])

    if (!companies.has(outlet.companyId)) {
      companies.set(outlet.companyId, {
        companyId: outlet.companyId,
        companyName: outlet.companyName,
        outlets: [],
        totalCredits: '0',
      })
    }

    const company = companies.get(outlet.companyId)
    company.outlets.push({
      outletId: outlet.id,
      outletName: outlet.name,
      outletCode: outlet.outletCode,
      credits: credits.toString(),
    })
    company.totalCredits = (BigInt(company.totalCredits) + credits).toString()
  }

  return {
    quotation: {
      reference: `QT-${generatedAt.getTime()}`,
      generatedAt: generatedAt.toISOString(),
      brandId: brand.id,
      brandName: brand.name,
      companies: [...companies.values()],
      totalCredits: calculateTotalCredits(outlets, creditsByOutlet).toString(),
    },
    error: null,
  }
}
