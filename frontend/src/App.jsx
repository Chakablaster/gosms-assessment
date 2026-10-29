
import ChooseBusinessView from './components/ChooseBusinessView'
import SmsTopUpView from './components/SmsTopUpView'
import QuotationView from './components/QuotationView'
import QuotationHistoryView from './components/QuotationHistoryView'
import Toast from './components/Toast'
import useSmsReload from './hooks/useSmsReload'

function App() {
  const flow = useSmsReload()

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
          <span className="text-xl font-bold tracking-tight text-brand">GoSMS</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {flow.businessStatus === 'loading' ? (
          <p role="status" className="text-sm text-text-secondary">Loading businesses...</p>
        ) : flow.businessStatus === 'error' ? (
          <div role="alert" className="rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-error">{flow.businessError}</p>
            <button
              type="button"
              onClick={flow.retryLoadingBusinesses}
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-surface hover:bg-brand-hover"
            >
              Retry
            </button>
          </div>
        ) : flow.screen === 'quotation' && flow.viewedQuotation ? (
          <QuotationView
            quotation={flow.viewedQuotation}
            email={flow.viewedEmail}
            onRetryEmail={flow.retryViewedEmail}
            backLabel={flow.quotationBackLabel}
            onBack={flow.backFromQuotation}
          />
        ) : flow.screen === 'history' ? (
          <QuotationHistoryView
            brandName={flow.selectedBrandName}
            requests={flow.previousQuotations}
            quotedCredits={flow.quotedCredits}
            onBack={flow.showTopUp}
            onView={flow.viewQuotationFromHistory}
          />
        ) : flow.screen === 'top-up' ? (
          <SmsTopUpView
            selectedBrandName={flow.selectedBrandName}
            onChangeBrand={flow.showBrandSelection}
            outlets={flow.selectedOutlets}
            creditsByOutlet={flow.creditsByOutlet}
            currentCreditsByOutlet={flow.currentCreditsByOutlet}
            balanceError={flow.balanceError}
            errorsByOutlet={flow.errorsByOutlet}
            onCreditChange={flow.changeCredit}
            totalCredits={flow.totalCredits}
            quotationError={flow.quotationError}
            onGenerateQuotation={flow.generateCurrentQuotation}
            isGenerating={flow.isGenerating}
            isRetryPending={flow.isRetryPending}
            quotationCount={flow.previousQuotations.length}
            onViewHistory={flow.showQuotationHistory}
          />
        ) : (
          <ChooseBusinessView
            brands={flow.brands}
            selectedBrandId={flow.selectedBrandId}
            onBrandChange={flow.changeBrand}
            onContinue={flow.continueToTopUp}
          />
        )}
      </main>

      <Toast message={flow.toastMessage} variant={flow.toastVariant} onDismiss={flow.dismissToast} />
    </div>
  )
}

export default App
