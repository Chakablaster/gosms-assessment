import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Toast from '../components/Toast'

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers())

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders nothing when there is no message', () => {
    render(<Toast message="" onDismiss={vi.fn()} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the message at the top centre of the viewport', () => {
    render(<Toast message="Quotation generated successfully." onDismiss={vi.fn()} />)

    const toast = screen.getByRole('status')

    expect(toast).toHaveTextContent('Quotation generated successfully.')
    expect(toast.parentElement).toHaveClass('fixed', 'inset-x-0', 'top-5', 'flex', 'justify-center')
  })

  it('allows manual dismissal', () => {
    const onDismiss = vi.fn()

    render(<Toast message="Quotation generated successfully." onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('automatically dismisses after four seconds, not before', () => {
    const onDismiss = vi.fn()

    render(<Toast message="Quotation generated successfully." onDismiss={onDismiss} />)

    act(() => vi.advanceTimersByTime(3999))
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('cancels the timer when the toast is cleared', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast message="Generated" onDismiss={onDismiss} />)

    rerender(<Toast message="" onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(4000))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('restarts the timeout when the message changes', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast message="First quotation" onDismiss={onDismiss} />)

    act(() => vi.advanceTimersByTime(2000))
    rerender(<Toast message="Second quotation" onDismiss={onDismiss} />)

    act(() => vi.advanceTimersByTime(2000))
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(2000))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
