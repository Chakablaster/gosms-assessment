import { validateCreditAmount, calculateTotalCredits } from './credits'

export function getTopUpDetails(brandId, creditsByOutlet, brands, companies, outlets) {
  const selectedBrand = brands.find((brand) => brand.id === brandId)
  const companyNames = new Map(companies.map((company) => [company.id, company.name]))

  const selectedOutlets = outlets
    .filter((outlet) => outlet.brandId === brandId)
    .map((outlet) => ({
      ...outlet,
      companyName: companyNames.get(outlet.companyId) ?? 'Company unavailable',
    }))

  const errorsByOutlet = Object.fromEntries(
    selectedOutlets.map((outlet) => [
      outlet.id,
      validateCreditAmount(creditsByOutlet[outlet.id] ?? '0'),
    ])
  )

  return {
    selectedBrand,
    selectedOutlets,
    errorsByOutlet,
    totalCredits: calculateTotalCredits(selectedOutlets, creditsByOutlet),
  }
}
