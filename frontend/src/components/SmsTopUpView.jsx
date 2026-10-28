
import { ArrowLeft } from 'lucide-react'

function SmsTopUpView({ selectedBrandName, onChangeBrand, outlets, creditsByOutlet, currentCreditsByOutlet, balanceError, errorsByOutlet, onCreditChange, totalCredits, quotationError, onGenerateQuotation, quotationCount, onViewHistory, isGenerating = false }) {
  function handleCreditFocus(event) {
    if (event.currentTarget.value === '0') {
      event.currentTarget.select()
    }
  }

  return (
    <section
      aria-labelledby="top-up-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onChangeBrand}
          disabled={isGenerating}
          className="inline-flex h-9 items-center gap-2 text-sm font-medium leading-none text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          <span>Change Brand</span>
        </button>

        {quotationCount > 0 && (
          <button
            type="button"
            onClick={onViewHistory}
            disabled={isGenerating}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium leading-none text-brand hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            History
          </button>
        )}
      </div>

      <div className="mt-5 border-b border-border pb-6">
        <h1 id="top-up-heading" className="text-2xl font-semibold tracking-tight">
          SMS Top Up
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{selectedBrandName}</p>
      </div>

      {balanceError && (
        <p role="alert" className="mt-5 text-sm text-error">{balanceError}</p>
      )}

      {outlets.length === 0 ? (
        <p className="py-10 text-sm text-text-secondary">
          No outlets are configured for this brand.
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-190 border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-text-primary">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3 font-semibold">No.</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Outlet</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Company</th>
                  <th scope="col" className="w-36 px-4 py-3 text-right font-semibold">Current Credits</th>
                  <th scope="col" className="w-44 px-4 py-3 text-right font-semibold">Top Up Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {outlets.map((outlet, index) => {
                  const error = errorsByOutlet[outlet.id]
                  const errorId = `credits-${outlet.id}-error`

                  return (
                    <tr key={outlet.id}>
                      <td className="px-4 py-4 text-text-muted">{index + 1}</td>
                      <td className="px-4 py-4">
                        <div className="font-medium">{outlet.name}</div>
                        <div className="mt-1 text-xs text-text-muted">{outlet.outletCode}</div>
                      </td>
                      <td className="px-4 py-4 text-text-secondary">{outlet.companyName}</td>
                      <td className="px-4 py-4 text-right font-medium tabular-nums">
                        {currentCreditsByOutlet === null
                          ? '—'
                          : (currentCreditsByOutlet[outlet.id] ?? 0n).toLocaleString('en-MY')}
                      </td>
                      <td className="px-4 py-4">
                        <label className="sr-only" htmlFor={`credits-${outlet.id}`}>
                          SMS credits for {outlet.name} ({outlet.outletCode})
                        </label>
                        <input
                          id={`credits-${outlet.id}`}
                          type="text"
                          inputMode="numeric"
                          value={creditsByOutlet[outlet.id] ?? '0'}
                          onFocus={handleCreditFocus}
                          onClick={handleCreditFocus}
                          onChange={(event) => onCreditChange(outlet.id, event.target.value)}
                          disabled={isGenerating}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? errorId : undefined}
                          className={`w-full rounded-lg border px-3 py-2 text-right focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                            error
                              ? 'border-error focus:border-error focus:ring-error/20'
                              : 'border-border-strong focus:border-brand focus:ring-brand/20'
                          }`}
                        />
                        {error && (
                          <p id={errorId} role="alert" className="mt-1 text-xs text-error">
                            {error}
                          </p>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl bg-brand-soft p-5">
            <p className="text-sm text-text-secondary">Total Top Up Credits</p>
            <output aria-label="Total SMS Credits" className="text-3xl font-bold text-brand">
              {totalCredits.toLocaleString('en-MY')}
            </output>
          </div>

          {quotationError && (
            <p role="alert" className="mt-4 text-sm text-error">{quotationError}</p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onGenerateQuotation}
              disabled={isGenerating}
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-surface hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? 'Generating Quotation...' : 'Generate Quotation'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default SmsTopUpView
