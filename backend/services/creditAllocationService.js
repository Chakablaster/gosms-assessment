
export class CreditAllocationError extends Error {
  constructor(message, status = 422) {
    super(message)
    this.status = status
  }
}

export function createCreditAllocationService({ companies, outlets }) {
  const outletById = new Map(outlets.map((outlet) => [outlet.id, outlet]))
  const balancesByCompany = new Map(companies.map((company) => [company.id, new Map()]))
  const allocatedQuotations = new Map()

  for (const outlet of outlets) {
    const companyBalances = balancesByCompany.get(outlet.companyId)

    if (!companyBalances) {
      throw new Error(`Unknown company for outlet ${outlet.id}.`)
    }

    companyBalances.set(outlet.id, 0n)
  }

  function getBalances() {
    const companyBalances = {}
    const outletBalances = {}

    for (const [companyId, balances] of balancesByCompany) {
      let companyTotal = 0n

      for (const [outletId, credits] of balances) {
        outletBalances[outletId] = credits.toString()
        companyTotal += credits
      }

      companyBalances[companyId] = companyTotal.toString()
    }

    return { companyBalances, outletBalances }
  }

  function allocate(quotation) {
    if (
      !quotation ||
      typeof quotation.reference !== 'string' ||
      !/^QT-\d+$/.test(quotation.reference) ||
      typeof quotation.brandId !== 'string' ||
      !Array.isArray(quotation.companies)
    ) {
      throw new CreditAllocationError('Invalid quotation for credit allocation.')
    }

    const entries = []
    const seenCompanies = new Set()
    const seenOutlets = new Set()
    let quotationTotal = 0n

    for (const company of quotation.companies) {
      if (
        !company ||
        !balancesByCompany.has(company.companyId) ||
        seenCompanies.has(company.companyId) ||
        !Array.isArray(company.outlets)
      ) {
        throw new CreditAllocationError('Invalid company allocation.')
      }

      seenCompanies.add(company.companyId)
      let companyTotal = 0n

      for (const item of company.outlets) {
        const outlet = outletById.get(item?.outletId)

        if (
          !outlet ||
          outlet.companyId !== company.companyId ||
          outlet.brandId !== quotation.brandId ||
          seenOutlets.has(item.outletId) ||
          typeof item.credits !== 'string' ||
          !/^\d+$/.test(item.credits) ||
          !Number.isSafeInteger(Number(item.credits))
        ) {
          throw new CreditAllocationError('Invalid outlet allocation.')
        }

        seenOutlets.add(item.outletId)

        const credits = BigInt(item.credits)
        companyTotal += credits

        if (credits > 0n) {
          entries.push({
            companyId: company.companyId,
            outletId: outlet.id,
            credits,
          })
        }
      }

      if (companyTotal.toString() !== company.totalCredits) {
        throw new CreditAllocationError('Company credit total does not match the allocation.')
      }

      quotationTotal += companyTotal
    }

    if (quotationTotal === 0n || quotationTotal.toString() !== quotation.totalCredits) {
      throw new CreditAllocationError('Quotation credit total does not match the allocation.')
    }

    const signature = JSON.stringify({
      brandId: quotation.brandId,
      companies: quotation.companies.map((company) => ({
        companyId: company.companyId,
        outlets: company.outlets.map((item) => ({
          outletId: item.outletId,
          credits: item.credits,
        })),
      })),
      totalCredits: quotation.totalCredits,
    })

    if (allocatedQuotations.has(quotation.reference)) {
      if (allocatedQuotations.get(quotation.reference) !== signature) {
        throw new CreditAllocationError(
          'Quotation reference was already allocated with different credits.',
          409
        )
      }

      return {
        reference: quotation.reference,
        alreadyAllocated: true,
      }
    }

    for (const entry of entries) {
      const companyBalances = balancesByCompany.get(entry.companyId)

      companyBalances.set(
        entry.outletId,
        companyBalances.get(entry.outletId) + entry.credits
      )
    }

    allocatedQuotations.set(quotation.reference, signature)

    return {
      reference: quotation.reference,
      alreadyAllocated: false,
    }
  }

  return { allocate, getBalances }
}
