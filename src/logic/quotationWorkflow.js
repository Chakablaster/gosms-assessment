export const initialWorkflowState = {
  activeRequestByBrand: {},
  requestsById: {},
  nextRequestNumber: 1,
  lastQuotationTimestamp: 0,
}

export function getActiveRequest(state, brandId) {
  const requestId = state.activeRequestByBrand[brandId]
  return requestId ? state.requestsById[requestId] : null
}

export function getBrandQuotations(state, brandId) {
  return Object.values(state.requestsById)
    .filter((request) => request.brandId === brandId && request.status === 'generated')
    .reverse()
}

export function getOutletCurrentCredits(state, brandId) {
  const creditsByOutlet = {}

  for (const request of getBrandQuotations(state, brandId)) {
    for (const company of request.quotation.companies) {
      for (const outlet of company.outlets) {
        creditsByOutlet[outlet.outletId] =
          (creditsByOutlet[outlet.outletId] ?? 0n) + BigInt(outlet.credits)
      }
    }
  }

  return creditsByOutlet
}

export function getBrandQuotedCredits(state, brandId) {
  return Object.values(getOutletCurrentCredits(state, brandId))
    .reduce((total, credits) => total + credits, 0n)
}

function createRequest(state, brandId) {
  const current = getActiveRequest(state, brandId)
  const requestsById = { ...state.requestsById }

  if (current?.status === 'draft') {
    delete requestsById[current.id]
  }

  const id = `request-${state.nextRequestNumber}`
  requestsById[id] = {
    id,
    brandId,
    status: 'draft',
    creditsByOutlet: {},
    quotation: null,
  }

  return {
    ...state,
    nextRequestNumber: state.nextRequestNumber + 1,
    activeRequestByBrand: { ...state.activeRequestByBrand, [brandId]: id },
    requestsById,
  }
}

export function workflowReducer(state, action) {
  const { brandId } = action
  const current = getActiveRequest(state, brandId)

  switch (action.type) {
    case 'OPEN_BRAND':
      return current ? state : createRequest(state, brandId)

    case 'START_NEW':
      return createRequest(state, brandId)

    case 'SET_CREDIT': {
      if (current?.status !== 'draft') return state
      if ((current.creditsByOutlet[action.outletId] ?? '0') === action.value) return state

      return {
        ...state,
        requestsById: {
          ...state.requestsById,
          [current.id]: {
            ...current,
            creditsByOutlet: {
              ...current.creditsByOutlet,
              [action.outletId]: action.value,
            },
          },
        },
      }
    }

    case 'GENERATION_SUCCEEDED': {
      if (current?.status !== 'draft' || !action.quotation) return state

      return {
        ...state,
        lastQuotationTimestamp: Math.max(
          state.lastQuotationTimestamp,
          Date.parse(action.quotation.generatedAt) || 0
        ),
        requestsById: {
          ...state.requestsById,
          [current.id]: { ...current, status: 'generated', quotation: action.quotation },
        },
      }
    }

    default:
      return state
  }
}
