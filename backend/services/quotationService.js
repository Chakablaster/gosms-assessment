import { generateQuotation } from '../logic/quotation.js'

export class QuotationError extends Error {
  constructor(message, status = 422) {
    super(message)
    this.status = status
  }
}

export function createQuotationService({ brands, companies, outlets, clock = () => Date.now() }) {
  let lastTimestamp = 0
  const companyNames = new Map(companies.map((company) => [company.id, company.name]))

  function generate({ brandId, creditsByOutlet } = {}) {
    if (typeof brandId !== 'string') {
      throw new QuotationError('Select a valid client brand.')
    }

    const brand = brands.find((item) => item.id === brandId)
    if (!brand) throw new QuotationError('Client brand not found.', 404)

    if (!creditsByOutlet || typeof creditsByOutlet !== 'object' || Array.isArray(creditsByOutlet)) {
      throw new QuotationError('Invalid SMS credit allocations.')
    }

    const brandOutlets = outlets.filter((outlet) => outlet.brandId === brandId)
    const allowedIds = new Set(brandOutlets.map((outlet) => outlet.id))

    if (Object.entries(creditsByOutlet).some(([id, value]) => !allowedIds.has(id) || typeof value !== 'string')) {
      throw new QuotationError('Invalid SMS credit allocations.')
    }

    const selectedOutlets = brandOutlets.map((outlet) => ({
      ...outlet,
      companyName: companyNames.get(outlet.companyId) ?? 'Company unavailable',
    }))

    const timestamp = Math.max(clock(), lastTimestamp + 1)
    const result = generateQuotation(brand, selectedOutlets, creditsByOutlet, new Date(timestamp))

    if (result.error) throw new QuotationError(result.error)

    lastTimestamp = timestamp
    return result.quotation
  }

  return { generate }
}
