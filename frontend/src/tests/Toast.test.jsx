import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import Toast from '../components/Toast'

describe('Toast notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders nothing when the message is empty', () => {
    const { container } = render(<Toast message="" onDismiss={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows a success message at the top centre of the screen', () => {
    render(<Toast message="Quotation generated successfully." onDismiss={vi.fn()} />)

    const notification = screen.getByRole('status')

    expect(notification).toHaveTextContent('Quotation generated successfully.')
    expect(notification).toHaveAttribute('aria-live', 'polite')
    expect(notification).toHaveClass('bg-success-soft', 'text-success')
    expect(notification.parentElement).toHaveClass('fixed', 'inset-x-0', 'top-5', 'flex', 'justify-center')
  })

  it('announces error messages as alerts', () => {
    render(<Toast message="Could not generate quotation." variant="error" onDismiss={vi.fn()} />)

    const notification = screen.getByRole('alert')

    expect(notification).toHaveTextContent('Could not generate quotation.')
    expect(notification).toHaveAttribute('aria-live', 'assertive')
    expect(notification).toHaveClass('bg-error-soft', 'text-error')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('calls the dismiss handler when the close button is clicked', () => {
    const onDismiss = vi.fn()
    render(<Toast message="Quotation generated successfully." onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('dismisses after four seconds, but not earlier', () => {
    const onDismiss = vi.fn()
    render(<Toast message="Quotation generated successfully." onDismiss={onDismiss} />)

    act(() => vi.advanceTimersByTime(3999))
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('cancels dismissal when the message is cleared', () => {
    const onDismiss = vi.fn()
    const { container, rerender } = render(<Toast message="Quotation generated." onDismiss={onDismiss} />)

    rerender(<Toast message="" onDismiss={onDismiss} />)
    act(() => vi.advanceTimersByTime(4000))

    expect(container).toBeEmptyDOMElement()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('starts a fresh four-second timer when a new message arrives', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast message="First quotation generated." onDismiss={onDismiss} />)

    act(() => vi.advanceTimersByTime(2000))
    rerender(<Toast message="Second quotation generated." onDismiss={onDismiss} />)

    act(() => vi.advanceTimersByTime(2000))
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(2000))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('clears its timer when the notification is removed from the page', () => {
    const onDismiss = vi.fn()
    const { unmount } = render(<Toast message="Quotation generated." onDismiss={onDismiss} />)

    unmount()
    act(() => vi.advanceTimersByTime(4000))

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
