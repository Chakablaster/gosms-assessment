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
    email: { status: 'not_sent', error: null },
  }

  return {
    ...state,
    nextRequestNumber: state.nextRequestNumber + 1,
    activeRequestByBrand: { ...state.activeRequestByBrand, [brandId]: id },
    requestsById,
  }
}

export function workflowReducer(state, action) {
  const current = getActiveRequest(state, action.brandId)
  const target = state.requestsById[action.requestId]

  switch (action.type) {
    case 'OPEN_BRAND':
      return current ? state : createRequest(state, action.brandId)

    case 'START_NEW':
      return createRequest(state, action.brandId)

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

    case 'EMAIL_SEND_STARTED':
      if (target?.status !== 'generated' || ['sending', 'sent'].includes(target.email.status)) return state

      return {
        ...state,
        requestsById: {
          ...state.requestsById,
          [target.id]: { ...target, email: { status: 'sending', error: null } },
        },
      }

    case 'EMAIL_SEND_SUCCEEDED':
      if (target?.email.status !== 'sending') return state

      return {
        ...state,
        requestsById: {
          ...state.requestsById,
          [target.id]: { ...target, email: { status: 'sent', error: null } },
        },
      }

    case 'EMAIL_SEND_FAILED':
      if (target?.email.status !== 'sending') return state

      return {
        ...state,
        requestsById: {
          ...state.requestsById,
          [target.id]: { ...target, email: { status: 'failed', error: action.error } },
        },
      }

    default:
      return state
  }
}
