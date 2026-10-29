import { useEffect, useReducer, useRef, useState } from 'react'
import { getTopUpDetails } from '../logic/topUp'
import { getBusinesses, getCreditBalances, getQuotationHistory, createQuotation } from '../services/gosmsApi'
import { sendQuotationEmail } from '../services/quotationEmail'
import {
  initialWorkflowState,
  workflowReducer,
  getActiveRequest,
  getBrandQuotations,
} from '../logic/quotationWorkflow'

function createOperationId() {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function useSmsReload() {
  const [businessData, setBusinessData] = useState({ brands: [], companies: [], outlets: [] })
  const [businessStatus, setBusinessStatus] = useState('loading')
  const [businessError, setBusinessError] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)
  const [creditBalances, setCreditBalances] = useState(null)
  const [balanceError, setBalanceError] = useState('')
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [screen, setScreen] = useState('choose')
  const [workflow, dispatch] = useReducer(workflowReducer, initialWorkflowState)
  const [viewedRequestId, setViewedRequestId] = useState(null)
  const [viewedHistoryRequest, setViewedHistoryRequest] = useState(null)
  const [quotationOrigin, setQuotationOrigin] = useState('top-up')
  const [quotationError, setQuotationError] = useState('')
  const [toast, setToast] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [retryPendingRequestId, setRetryPendingRequestId] = useState(null)
  const [historyState, setHistoryState] = useState({
    brandId: '',
    status: 'idle',
    requests: [],
    error: '',
  })

  const pendingGeneration = useRef(false)
  const pendingEmails = useRef(new Set())
  const pendingOperations = useRef(new Map())
  const historyLoadVersion = useRef(0)

  useEffect(() => {
    let active = true

    Promise.all([getBusinesses(), getCreditBalances()])
      .then(([data, balances]) => {
        if (!active) return
        setBusinessData(data)
        setCreditBalances(balances)
        setBusinessError('')
        setBalanceError('')
        setBusinessStatus('ready')
      })
      .catch((error) => {
        if (!active) return
        setBusinessError(error instanceof Error ? error.message : 'Unable to load GoSMS data.')
        setBusinessStatus('error')
      })

    return () => {
      active = false
    }
  }, [loadVersion])

  const { brands, companies, outlets } = businessData
  const currentRequest = getActiveRequest(workflow, selectedBrandId)
  const creditsByOutlet = currentRequest?.creditsByOutlet ?? {}

  const { selectedBrand, selectedOutlets, errorsByOutlet, totalCredits } = getTopUpDetails(
    selectedBrandId, creditsByOutlet, brands, companies, outlets
  )

  const localQuotations = getBrandQuotations(workflow, selectedBrandId)
  const historyForBrand = historyState.brandId === selectedBrandId
  const previousQuotations = historyForBrand && historyState.status === 'ready'
    ? historyState.requests
    : localQuotations
  const historyStatus = historyForBrand ? historyState.status : 'idle'
  const historyError = historyForBrand ? historyState.error : ''
  const persistedQuotationCount = creditBalances?.historyCountByBrand?.[selectedBrandId] ?? 0
  const quotationCount = Math.max(localQuotations.length, persistedQuotationCount)
  const viewedRequest = quotationOrigin === 'history'
    ? viewedHistoryRequest
    : workflow.requestsById[viewedRequestId]
  const isRetryPending = Boolean(currentRequest && currentRequest.id === retryPendingRequestId)

  const currentCreditsByOutlet = creditBalances
    ? Object.fromEntries(
        Object.entries(creditBalances.outletBalances).map(([outletId, credits]) => [
          outletId,
          BigInt(credits),
        ])
      )
    : null

  function retryLoadingBusinesses() {
    setBusinessStatus('loading')
    setBusinessError('')
    setLoadVersion((previous) => previous + 1)
  }

  async function refreshCreditBalances() {
    try {
      const balances = await getCreditBalances()
      setCreditBalances(balances)
      setBalanceError('')
    } catch {
      setCreditBalances(null)
      setBalanceError('Current credit balances could not be refreshed.')
    }
  }

  function changeBrand(brandId) {
    if (pendingGeneration.current || isRetryPending) return
    setSelectedBrandId(brandId)
    setQuotationError('')
  }

  function continueToTopUp() {
    if (!selectedBrand) return
    dispatch({ type: 'OPEN_BRAND', brandId: selectedBrandId })
    setScreen('top-up')
  }

  function changeCredit(outletId, value) {
    if (pendingGeneration.current || isRetryPending) return
    dispatch({ type: 'SET_CREDIT', brandId: selectedBrandId, outletId, value })
    setQuotationError('')
  }

  function deliverQuotation(requestId, quotation, isRetry = false) {
    if (pendingEmails.current.has(requestId) || workflow.requestsById[requestId]?.email?.status === 'sent') return

    pendingEmails.current.add(requestId)

    if (isRetry) setToast(null)

    dispatch({ type: 'EMAIL_SEND_STARTED', requestId })

    void sendQuotationEmail(quotation)
      .then(() => {
        dispatch({ type: 'EMAIL_SEND_SUCCEEDED', requestId })
        setToast({
          message: isRetry
            ? 'Quotation email sent successfully.'
            : 'Quotation generated and emailed successfully. SMS credits have been allocated.',
          variant: 'success',
        })
      })
      .catch((error) => {
        dispatch({ type: 'EMAIL_SEND_FAILED', requestId, error: error.message })
        setToast({
          message: isRetry
            ? 'Quotation email could not be sent.'
            : 'Quotation generated, but the email could not be sent. SMS credits were allocated.',
          variant: 'error',
        })
      })
      .finally(() => pendingEmails.current.delete(requestId))
  }

  async function generateCurrentQuotation() {
    if (currentRequest?.status !== 'draft' || pendingGeneration.current) return

    if (Object.values(errorsByOutlet).some(Boolean)) {
      setQuotationError('Correct the invalid SMS credit amounts before generating a quotation.')
      return
    }

    if (totalCredits === 0n) {
      setQuotationError('Allocate at least 1 SMS credit to generate a quotation.')
      return
    }

    const requestId = currentRequest.id
    const brandId = selectedBrandId

    const operation = pendingOperations.current.get(requestId) ?? {
      operationId: createOperationId(),
      brandId,
      creditsByOutlet: { ...creditsByOutlet },
    }

    pendingOperations.current.set(requestId, operation)

    pendingGeneration.current = true
    setIsGenerating(true)
    setQuotationError('')
    setToast(null)

    try {
      const quotation = await createQuotation(
        operation.brandId,
        operation.creditsByOutlet,
        operation.operationId
      )

      pendingOperations.current.delete(requestId)
      setRetryPendingRequestId(null)

      dispatch({ type: 'GENERATION_SUCCEEDED', brandId, quotation })
      setViewedRequestId(requestId)
      setViewedHistoryRequest(null)
      setQuotationOrigin('top-up')
      setScreen('quotation')
      historyLoadVersion.current += 1

      setHistoryState((previous) => previous.brandId === brandId
        ? { brandId, status: 'idle', requests: [], error: '' }
        : previous
      )

      setToast({
        message: 'Quotation generated. SMS credits allocated successfully.',
        variant: 'success',
      })

      setCreditBalances(null)
      void refreshCreditBalances()
      deliverQuotation(requestId, quotation)
    } catch (error) {
      const knownFailure = typeof error?.status === 'number' &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409

      if (knownFailure) {
        pendingOperations.current.delete(requestId)
        setRetryPendingRequestId(null)
      } else {
        setRetryPendingRequestId(requestId)
      }

      setQuotationError(
        error instanceof Error ? error.message : 'Quotation generation failed.'
      )
    } finally {
      pendingGeneration.current = false
      setIsGenerating(false)
    }
  }

  async function loadQuotationHistory(brandId) {
    const version = ++historyLoadVersion.current

    setHistoryState({ brandId, status: 'loading', requests: [], error: '' })

    try {
      const requests = await getQuotationHistory(brandId)
      if (version !== historyLoadVersion.current) return
      setHistoryState({ brandId, status: 'ready', requests, error: '' })
    } catch (error) {
      if (version !== historyLoadVersion.current) return
      setHistoryState({
        brandId,
        status: 'error',
        requests: [],
        error: error instanceof Error ? error.message : 'Unable to load quotation history.',
      })
    }
  }

  function showQuotationHistory() {
    if (pendingGeneration.current || isRetryPending) return
    setScreen('history')
    void loadQuotationHistory(selectedBrandId)
  }

  function viewQuotationFromHistory(requestId) {
    const request = previousQuotations.find((item) => item.id === requestId)
    if (!request) return

    setViewedHistoryRequest(request)
    setViewedRequestId(null)
    setQuotationOrigin('history')
    setToast(null)
    setScreen('quotation')
  }

  function retryViewedEmail() {
    if (quotationOrigin === 'history' || viewedRequest?.email?.status !== 'failed') return
    deliverQuotation(viewedRequest.id, viewedRequest.quotation, true)
  }

  function backFromQuotation() {
    if (
      quotationOrigin === 'top-up' &&
      currentRequest?.status === 'generated' &&
      currentRequest.id === viewedRequestId
    ) {
      dispatch({ type: 'START_NEW', brandId: selectedBrandId })
    }

    setViewedRequestId(null)
    setViewedHistoryRequest(null)
    setToast(null)
    setScreen(quotationOrigin)
  }

  return {
    businessStatus,
    businessError,
    retryLoadingBusinesses,
    screen,
    brands,
    selectedBrandId,
    selectedBrandName: selectedBrand?.name ?? '',
    selectedOutlets,
    creditsByOutlet,
    errorsByOutlet,
    totalCredits,
    isGenerating,
    isRetryPending,
    currentCreditsByOutlet,
    balanceError,
    previousQuotations,
    quotationCount,
    historyStatus,
    historyError,
    quotedCredits: previousQuotations.reduce(
      (total, request) => total + BigInt(request.quotation.totalCredits), 0n
    ),
    viewedQuotation: viewedRequest?.quotation,
    viewedEmail: quotationOrigin === 'history' ? null : viewedRequest?.email,
    quotationBackLabel: quotationOrigin === 'history' ? 'Back to History' : 'Back to SMS Top Up',
    quotationError,
    toastMessage: toast?.message ?? '',
    toastVariant: toast?.variant ?? 'success',
    changeBrand,
    continueToTopUp,
    changeCredit,
    generateCurrentQuotation,
    retryViewedEmail,
    viewQuotationFromHistory,
    backFromQuotation,
    showBrandSelection: () => {
      if (!pendingGeneration.current && !isRetryPending) setScreen('choose')
    },
    showTopUp: () => setScreen('top-up'),
    showQuotationHistory,
    retryQuotationHistory: () => {
      if (selectedBrandId) void loadQuotationHistory(selectedBrandId)
    },
    dismissToast: () => setToast(null),
  }
}

export default useSmsReload
