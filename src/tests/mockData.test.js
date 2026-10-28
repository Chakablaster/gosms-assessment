import { describe, expect, it } from 'vitest'
import { brands, companies, outlets, prototypeExample } from '../data/mockData'

describe('GoSMS business data', () => {
  it('contains unique brand IDs', () => {
    const ids = brands.map((brand) => brand.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains unique company IDs', () => {
    const ids = companies.map((company) => company.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains unique outlet IDs and codes', () => {
    const ids = outlets.map((outlet) => outlet.id)
    const codes = outlets.map((outlet) => outlet.outletCode)

    expect(new Set(ids).size).toBe(outlets.length)
    expect(new Set(codes).size).toBe(outlets.length)
  })

  it('associates outlets with valid brands and companies', () => {
    const brandIds = new Set(brands.map((brand) => brand.id))
    const companyIds = new Set(
      companies.map((company) => company.id)
    )

    outlets.forEach((outlet) => {
      expect(brandIds.has(outlet.brandId)).toBe(true)
      expect(companyIds.has(outlet.companyId)).toBe(true)
    })
  })

  it('provides outlets for every brand', () => {
    brands.forEach((brand) => {
      const brandOutlets = outlets.filter(
        (outlet) => outlet.brandId === brand.id
      )

      expect(brandOutlets.length).toBeGreaterThan(0)
    })
  })

  it('preserves duplicate outlet names from the prototype', () => {
    const binjaiOutlets = outlets.filter(
      (outlet) =>
        outlet.brandId === 'silvertree' &&
        outlet.name === 'Binjai Park'
    )

    expect(binjaiOutlets).toHaveLength(3)

    expect(
      new Set(binjaiOutlets.map((outlet) => outlet.id)).size
    ).toBe(3)
  })

  it('preserves the original prototype total of 900', () => {
    const total = Object.values(
      prototypeExample.topUpsByOutletId
    ).reduce((sum, amount) => sum + amount, 0)

    expect(total).toBe(900)
  })

  it('references valid outlets in the prototype scenario', () => {
    const outletIds = new Set(
      outlets
        .filter(
          (outlet) =>
            outlet.brandId === prototypeExample.brandId
        )
        .map((outlet) => outlet.id)
    )

    Object.keys(prototypeExample.topUpsByOutletId).forEach(
      (outletId) => {
        expect(outletIds.has(outletId)).toBe(true)
      }
    )
  })
})