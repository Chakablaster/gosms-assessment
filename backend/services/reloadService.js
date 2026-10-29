
export class ReloadError extends Error {
  constructor(message, status = 422) {
    super(message)
    this.status = status
  }
}

export function createReloadService({ quotationService, creditAllocationService }) {
  const processedOperations = new Map()

  function getSignature(brandId, creditsByOutlet) {
    const sortedCredits = creditsByOutlet && typeof creditsByOutlet === 'object' && !Array.isArray(creditsByOutlet)
      ? Object.entries(creditsByOutlet).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      : creditsByOutlet

    return JSON.stringify({ brandId, creditsByOutlet: sortedCredits })
  }

  function processReload({ operationId, brandId, creditsByOutlet } = {}) {
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(operationId)) {
      throw new ReloadError('Invalid top up operation identifier.')
    }

    const signature = getSignature(brandId, creditsByOutlet)
    const existing = processedOperations.get(operationId)

    if (existing) {
      if (existing.signature !== signature) {
        throw new ReloadError('This top up operation has already been processed with different details.', 409)
      }

      return {
        quotation: existing.quotation,
        allocation: { reference: existing.quotation.reference, alreadyAllocated: true },
      }
    }

    const quotation = quotationService.generate({ brandId, creditsByOutlet })
    const allocation = creditAllocationService.allocate(quotation)

    processedOperations.set(operationId, { signature, quotation })

    return { quotation, allocation }
  }

  return { processReload }
}
