import { useEffect } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

function Toast({ message, onDismiss, variant = 'success' }) {
  useEffect(() => {
    if (!message) return

    const timeoutId = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timeoutId)
  }, [message, onDismiss])

  if (!message) return null

  const isError = variant === 'error'
  const StatusIcon = isError ? AlertCircle : CheckCircle2

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-50 flex justify-center px-4">
      <div
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm shadow-card ${
          isError ? 'bg-error-soft text-error' : 'bg-success-soft text-success'
        }`}
      >
        <StatusIcon aria-hidden="true" className="size-5 shrink-0" />

        <p className="min-w-0 flex-1 font-medium">{message}</p>

        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md ${
            isError ? 'hover:bg-error/10' : 'hover:bg-success/10'
          }`}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  )
}

export default Toast