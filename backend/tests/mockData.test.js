import { describe, expect, it } from 'vitest'
import { brands, companies, outlets, prototypeExample } from '../data/mockData.js'

describe('sample business data', () => {
  // The feature uses IDs to match outlets to brands and companies.
  // Duplicate IDs would make those relationships unreliable.
  it('uses a different ID for each brand', () => {
    const ids = brands.map((brand) => brand.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses a different ID for each company', () => {
    const ids = companies.map((company) => company.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives outlets unique IDs and codes', () => {
    const ids = outlets.map((outlet) => outlet.id)
    const codes = outlets.map((outlet) => outlet.outletCode)

    expect(new Set(ids).size).toBe(outlets.length)
    expect(new Set(codes).size).toBe(outlets.length)
  })

  it('links each outlet to an existing brand and company', () => {
    const brandIds = new Set(brands.map((brand) => brand.id))
    const companyIds = new Set(companies.map((company) => company.id))

    for (const outlet of outlets) {
      expect(brandIds.has(outlet.brandId)).toBe(true)
      expect(companyIds.has(outlet.companyId)).toBe(true)
    }
  })

  it('keeps the three Binjai Park outlets separate', () => {
    // The original example has three outlets with the same display name.
    // They must remain separate records so credits go to the right outlet.
    const binjaiOutlets = outlets.filter(
      (outlet) => outlet.brandId === 'silvertree' && outlet.name === 'Binjai Park'
    )

    expect(binjaiOutlets).toHaveLength(3)
    expect(new Set(binjaiOutlets.map((outlet) => outlet.id)).size).toBe(3)
  })

  it('keeps the original example at 900 credits', () => {
    // The supplied example allocates 300 credits to each Binjai Park outlet.
    // It is reference data, not a starting balance for new quotations.
    const total = Object.values(prototypeExample.topUpsByOutletId)
      .reduce((sum, credits) => sum + credits, 0)

    expect(total).toBe(900)
  })

  it('only uses outlets belonging to the example brand', () => {
    const brandOutlets = outlets
      .filter((outlet) => outlet.brandId === prototypeExample.brandId)
      .map((outlet) => outlet.id)
    const knownOutletIds = new Set(brandOutlets)

    for (const outletId of Object.keys(prototypeExample.topUpsByOutletId)) {
      expect(knownOutletIds.has(outletId)).toBe(true)
    }
  })
})
