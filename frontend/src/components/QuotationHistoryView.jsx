import { ArrowLeft, FileText } from 'lucide-react'

function QuotationHistoryView({
  brandName,
  requests,
  quotedCredits,
  status,
  error,
  onRetry,
  onBack,
  onView,
}) {
  const hasRequests = requests.length > 0

  return (
    <section
      aria-labelledby="history-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span>Back to SMS Top Up</span>
      </button>

      <div className="mt-5 border-b border-border pb-6">
        <h1
          id="history-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          History
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {brandName}
        </p>
      </div>

      {status === 'loading' && (
        <div
          role="status"
          className="mt-6 rounded-xl border border-border bg-surface-muted px-6 py-12 text-center"
        >
          <p className="text-sm text-text-secondary">
            Loading quotation history...
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-6 rounded-xl border border-border bg-surface-muted p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p role="alert" className="text-sm text-error">
              {error}
            </p>

            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-brand hover:bg-surface-muted"
            >
              Retry History
            </button>
          </div>
        </div>
      )}

      {status === 'error' && hasRequests && (
        <p className="mt-3 text-sm text-text-secondary">
          Only quotations from this session are shown until history can be loaded.
        </p>
      )}

      {(status === 'ready' || hasRequests) && (
        <>
          <div className="mt-6 flex flex-wrap justify-between gap-6 rounded-xl bg-brand-soft p-5">
            <div>
              <p className="text-sm text-text-secondary">
                Generated Quotations
              </p>
              <output
                aria-label="Generated Quotations"
                className="mt-1 block text-3xl font-bold tabular-nums text-brand"
              >
                {requests.length}
              </output>
            </div>

            <div>
              <p className="text-sm text-text-secondary">
                Quoted SMS Credits
              </p>
              <output
                aria-label="Quoted SMS Credits"
                className="mt-1 block text-3xl font-bold tabular-nums text-brand"
              >
                {quotedCredits.toLocaleString('en-MY')}
              </output>
            </div>
          </div>

          {!hasRequests ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-border bg-surface-muted px-6 py-14 text-center sm:py-16">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-brand-soft">
                <FileText
                  aria-hidden="true"
                  className="size-8 text-brand"
                  strokeWidth={1.5}
                />
              </div>

              <h2 className="mt-6 text-lg font-semibold tracking-tight text-text-primary">
                No quotations yet
              </h2>

              <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
                Once an SMS top up is successfully completed,
                its quotation will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4"
                >
                  <div>
                    <p className="font-medium">
                      {request.quotation.reference}
                    </p>

                    <p className="mt-1 text-sm text-text-secondary">
                      {new Date(
                        request.quotation.generatedAt
                      ).toLocaleDateString('en-MY', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · Generated · '}
                      {BigInt(
                        request.quotation.totalCredits
                      ).toLocaleString('en-MY')}
                      {' SMS credits'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onView(request.id)}
                    className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-brand hover:bg-surface-muted"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default QuotationHistoryView
