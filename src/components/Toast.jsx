import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

function Toast({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return

    const timeoutId = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timeoutId)
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-success-soft px-4 py-3 text-sm text-success shadow-card"
      >
        <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />

        <p className="min-w-0 flex-1 font-medium">{message}</p>

        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-success/10"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  )
}

export default Toast
