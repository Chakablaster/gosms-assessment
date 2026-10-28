import { useReducer, useState } from 'react'
import { brands, companies, outlets } from '../data/mockData'
import { getTopUpDetails } from '../logic/topUp'
import { generateQuotation } from '../logic/quotation'
import { initialWorkflowState, workflowReducer, getActiveRequest, getBrandQuotations, getBrandQuotedCredits, getOutletCurrentCredits } from '../logic/quotationWorkflow'

function useSmsReload() {
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [screen, setScreen] = useState('choose')
  const [workflow, dispatch] = useReducer(workflowReducer, initialWorkflowState)
  const [viewedRequestId, setViewedRequestId] = useState(null)
  const [quotationOrigin, setQuotationOrigin] = useState('top-up')
  const [quotationError, setQuotationError] = useState('')
  const [toastMessage, setToastMessage] = useState('')

  const currentRequest = getActiveRequest(workflow, selectedBrandId)
  const creditsByOutlet = currentRequest?.creditsByOutlet ?? {}
  const { selectedBrand, selectedOutlets, errorsByOutlet, totalCredits } = getTopUpDetails(
    selectedBrandId, creditsByOutlet, brands, companies, outlets
  )
  const previousQuotations = getBrandQuotations(workflow, selectedBrandId)
  const viewedRequest = workflow.requestsById[viewedRequestId]

  function changeBrand(brandId) {
    setSelectedBrandId(brandId)
    setQuotationError('')
  }

  function continueToTopUp() {
    if (!selectedBrand) return
    dispatch({ type: 'OPEN_BRAND', brandId: selectedBrandId })
    setScreen('top-up')
  }

  function changeCredit(outletId, value) {
    dispatch({ type: 'SET_CREDIT', brandId: selectedBrandId, outletId, value })
    setQuotationError('')
  }

  function generateCurrentQuotation() {
    if (currentRequest?.status !== 'draft') return

    const timestamp = Math.max(Date.now(), workflow.lastQuotationTimestamp + 1)
    const result = generateQuotation(selectedBrand, selectedOutlets, creditsByOutlet, new Date(timestamp))

    if (result.error) {
      setQuotationError(result.error)
      return
    }

    dispatch({ type: 'GENERATION_SUCCEEDED', brandId: selectedBrandId, quotation: result.quotation })
    setViewedRequestId(currentRequest.id)
    setQuotationOrigin('top-up')
    setQuotationError('')
    setToastMessage('Quotation generated successfully.')
    setScreen('quotation')
  }

  function viewQuotationFromHistory(requestId) {
    setViewedRequestId(requestId)
    setQuotationOrigin('history')
    setToastMessage('')
    setScreen('quotation')
  }

  function backFromQuotation() {
    if (quotationOrigin === 'top-up' && currentRequest?.status === 'generated' && currentRequest.id === viewedRequestId) {
      dispatch({ type: 'START_NEW', brandId: selectedBrandId })
    }

    setViewedRequestId(null)
    setToastMessage('')
    setScreen(quotationOrigin)
  }

  return {
    screen,
    brands,
    selectedBrandId,
    selectedBrandName: selectedBrand?.name ?? '',
    selectedOutlets,
    creditsByOutlet,
    errorsByOutlet,
    totalCredits,
    currentCreditsByOutlet: getOutletCurrentCredits(workflow, selectedBrandId),
    quotedCredits: getBrandQuotedCredits(workflow, selectedBrandId),
    previousQuotations,
    viewedQuotation: viewedRequest?.quotation,
    quotationBackLabel: quotationOrigin === 'history' ? 'Back to History' : 'Back to SMS Top Up',
    quotationError,
    toastMessage,
    changeBrand,
    continueToTopUp,
    changeCredit,
    generateCurrentQuotation,
    viewQuotationFromHistory,
    backFromQuotation,
    showBrandSelection: () => setScreen('choose'),
    showTopUp: () => setScreen('top-up'),
    showQuotationHistory: () => setScreen('history'),
    dismissToast: () => setToastMessage(''),
  }
}

export default useSmsReload
