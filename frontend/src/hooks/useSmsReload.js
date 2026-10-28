import { useEffect, useReducer, useRef, useState } from 'react'
import { getTopUpDetails } from '../logic/topUp'
import { getBusinesses, createQuotation } from '../services/gosmsApi'
import { sendQuotationEmail } from '../services/quotationEmail'
import { initialWorkflowState, workflowReducer, getActiveRequest, getBrandQuotations, getBrandQuotedCredits, getOutletCurrentCredits } from '../logic/quotationWorkflow'

function useSmsReload() {
  const [businessData, setBusinessData] = useState({ brands: [], companies: [], outlets: [] })
  const [businessStatus, setBusinessStatus] = useState('loading')
  const [businessError, setBusinessError] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [screen, setScreen] = useState('choose')
  const [workflow, dispatch] = useReducer(workflowReducer, initialWorkflowState)
  const [viewedRequestId, setViewedRequestId] = useState(null)
  const [quotationOrigin, setQuotationOrigin] = useState('top-up')
  const [quotationError, setQuotationError] = useState('')
  const [toast, setToast] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const pendingGeneration = useRef(false)
  const pendingEmails = useRef(new Set())

  useEffect(() => {
    let active = true

    getBusinesses()
      .then((data) => {
        if (!active) return
        setBusinessData(data)
        setBusinessError('')
        setBusinessStatus('ready')
      })
      .catch((error) => {
        if (!active) return
        setBusinessError(error instanceof Error ? error.message : 'Unable to load client data.')
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
  const previousQuotations = getBrandQuotations(workflow, selectedBrandId)
  const viewedRequest = workflow.requestsById[viewedRequestId]

  function retryLoadingBusinesses() {
    setBusinessStatus('loading')
    setBusinessError('')
    setLoadVersion((previous) => previous + 1)
  }

  function changeBrand(brandId) {
    if (pendingGeneration.current) return
    setSelectedBrandId(brandId)
    setQuotationError('')
  }

  function continueToTopUp() {
    if (!selectedBrand) return
    dispatch({ type: 'OPEN_BRAND', brandId: selectedBrandId })
    setScreen('top-up')
  }

  function changeCredit(outletId, value) {
    if (pendingGeneration.current) return
    dispatch({ type: 'SET_CREDIT', brandId: selectedBrandId, outletId, value })
    setQuotationError('')
  }

  function deliverQuotation(requestId, quotation, isRetry = false) {
    if (pendingEmails.current.has(requestId) || workflow.requestsById[requestId]?.email?.status === 'sent') return

    pendingEmails.current.add(requestId)
    setToast(null)
    dispatch({ type: 'EMAIL_SEND_STARTED', requestId })

    void sendQuotationEmail(quotation)
      .then(() => {
        dispatch({ type: 'EMAIL_SEND_SUCCEEDED', requestId })
        setToast({
          message: isRetry
            ? 'Quotation email sent successfully.'
            : 'Quotation generated and emailed successfully.',
          variant: 'success',
        })
      })
      .catch((error) => {
        dispatch({ type: 'EMAIL_SEND_FAILED', requestId, error: error.message })
        setToast({
          message: isRetry
            ? 'Quotation email could not be sent.'
            : 'Quotation generated, but the email could not be sent.',
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

    pendingGeneration.current = true
    setIsGenerating(true)
    setQuotationError('')
    setToast(null)

    try {
      const quotation = await createQuotation(brandId, creditsByOutlet)

      dispatch({ type: 'GENERATION_SUCCEEDED', brandId, quotation })
      setViewedRequestId(requestId)
      setQuotationOrigin('top-up')
      setScreen('quotation')

      deliverQuotation(requestId, quotation)
    } catch (error) {
      setQuotationError(error instanceof Error ? error.message : 'Quotation generation failed.')
    } finally {
      pendingGeneration.current = false
      setIsGenerating(false)
    }
  }

  function viewQuotationFromHistory(requestId) {
    setViewedRequestId(requestId)
    setQuotationOrigin('history')
    setToast(null)
    setScreen('quotation')
  }

  function retryViewedEmail() {
    if (viewedRequest?.email?.status !== 'failed') return
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
    currentCreditsByOutlet: getOutletCurrentCredits(workflow, selectedBrandId),
    quotedCredits: getBrandQuotedCredits(workflow, selectedBrandId),
    previousQuotations,
    viewedQuotation: viewedRequest?.quotation,
    viewedEmail: viewedRequest?.email,
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
      if (!pendingGeneration.current) setScreen('choose')
    },
    showTopUp: () => setScreen('top-up'),
    showQuotationHistory: () => {
      if (!pendingGeneration.current) setScreen('history')
    },
    dismissToast: () => setToast(null),
  }
}

export default useSmsReload