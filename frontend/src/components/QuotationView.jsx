import { ArrowLeft } from 'lucide-react'

function QuotationView({ quotation, email, onRetryEmail, onBack, backLabel = 'Back to SMS Top Up' }) {
  return (
    <section aria-labelledby="quotation-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>{backLabel}</span>
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 id="quotation-heading" className="text-2xl font-semibold tracking-tight">SMS Credit Quotation</h1>
          <p className="mt-2 text-sm text-text-secondary">{quotation.brandName}</p>
        </div>
        <div className="text-left text-sm sm:text-right">
          <p className="font-medium text-text-primary">{quotation.reference}</p>
          <p className="mt-1 text-text-secondary">
            {new Date(quotation.generatedAt).toLocaleDateString('en-MY', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {quotation.companies.map((company) => (
          <section key={company.companyId} aria-label={company.companyName} className="overflow-hidden rounded-xl border border-border">
            <div className="bg-surface-muted px-4 py-3">
              <h2 className="text-base font-semibold">{company.companyName}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-120 text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-secondary">
                    <th scope="col" className="px-4 py-3 font-medium">Outlet</th>
                    <th scope="col" className="px-4 py-3 font-medium">Outlet Code</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">SMS Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {company.outlets.map((outlet) => (
                    <tr key={outlet.outletId}>
                      <td className="px-4 py-3 font-medium">{outlet.outletName}</td>
                      <td className="px-4 py-3 text-text-secondary">{outlet.outletCode}</td>
                      <td className="px-4 py-3 text-right">{BigInt(outlet.credits).toLocaleString('en-MY')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-surface-muted">
                    <th scope="row" colSpan={2} className="px-4 py-3 text-left font-semibold">Company Total</th>
                    <td className="px-4 py-3 text-right font-semibold">{BigInt(company.totalCredits).toLocaleString('en-MY')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-brand-soft p-5">
        <p className="text-sm text-text-secondary">Total Quoted SMS Credits</p>
        <p className="mt-1 text-3xl font-bold text-brand">{BigInt(quotation.totalCredits).toLocaleString('en-MY')}</p>
      </div>

      {email && ['sending', 'failed'].includes(email.status) && (
        <div
          aria-label="Email delivery status"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm"
        >
          <p className={email.status === 'failed' ? 'text-error' : 'text-text-secondary'}>
            {email.status === 'sending'
              ? 'Sending quotation to client…'
              : `Email not sent. ${email.error}`}
          </p>

          {email.status === 'failed' && (
            <button
              type="button"
              onClick={onRetryEmail}
              className="rounded-lg border border-border-strong bg-surface px-4 py-2 font-medium text-brand hover:bg-surface"
            >
              Retry Email
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export default QuotationView