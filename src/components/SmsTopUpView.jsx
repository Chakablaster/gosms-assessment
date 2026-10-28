import { ArrowLeft } from 'lucide-react'

function SmsTopUpView({ selectedBrandName, onChangeBrand, outlets, creditsByOutlet, onCreditChange, onReset, totalCredits }) {
  return (
    <section
      aria-labelledby="top-up-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8"
    >
      <button
        type="button"
        onClick={onChangeBrand}
        className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span>Change Brand</span>
      </button>

      <div className="mt-5 border-b border-border pb-6">
        <h1
          id="top-up-heading"
          className="text-2xl font-semibold tracking-tight"
        >
          SMS Top Up
        </h1>

        <p className="mt-2 text-sm text-text-secondary">
          {selectedBrandName}
        </p>
      </div>

      {outlets.length === 0 ? (
        <p className="py-10 text-sm text-text-secondary">
          No outlets are configured for this brand.
        </p>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-160 border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-text-primary">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3 font-semibold">
                    No.
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Outlet
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Company
                  </th>
                  <th scope="col" className="w-44 px-4 py-3 font-semibold">
                    SMS Credits
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {outlets.map((outlet, index) => (
                  <tr key={outlet.id}>
                    <td className="px-4 py-4 text-text-muted">
                      {index + 1}
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-medium">
                        {outlet.name}
                      </div>

                      <div className="mt-1 text-xs text-text-muted">
                        {outlet.outletCode}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-text-secondary">
                      {outlet.companyName}
                    </td>

                    <td className="px-4 py-4">
                      <label
                        className="sr-only"
                        htmlFor={`credits-${outlet.id}`}
                      >
                        SMS credits for {outlet.name} ({outlet.outletCode})
                      </label>

                      <input
                        id={`credits-${outlet.id}`}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={creditsByOutlet[outlet.id] ?? '0'}
                        onChange={(event) =>
                          onCreditChange(outlet.id, event.target.value)
                        }
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-right focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-brand-soft p-5">
            <div>
              <p className="text-sm text-text-secondary">
                Total SMS Credits
              </p>

              <output
                aria-label="Total SMS Credits"
                className="mt-1 block text-3xl font-bold text-brand"
              >
                {totalCredits.toLocaleString('en-MY')}
              </output>
            </div>

            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-border-strong bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-muted"
            >
              Reset Credits
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export default SmsTopUpView

