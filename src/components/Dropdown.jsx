import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

function Dropdown({ id, label, options, value, onChange, placeholder = 'Select an option' }) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const labelId = `${controlId}-label`
  const listboxId = `${controlId}-listbox`
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const listboxRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    if (isOpen) listboxRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function openDropdown(focusLast = false) {
    if (options.length === 0) return

    const selectedIndex = options.findIndex((option) => option.value === value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : focusLast ? options.length - 1 : 0)
    setIsOpen(true)
  }

  function selectOption(option) {
    onChange(option.value)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openDropdown(event.key === 'ArrowUp')
    }
  }

  function handleListboxKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + options.length) % options.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(options.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectOption(options[activeIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false)
        }
      }}
    >
      <span id={labelId} className="block text-sm font-medium">
        {label}
      </span>

      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        disabled={options.length === 0}
        onClick={() => isOpen ? setIsOpen(false) : openDropdown()}
        onKeyDown={handleTriggerKeyDown}
        className="mt-2 flex w-full items-center justify-between gap-3 rounded-lg border border-border-strong bg-surface px-3 py-3 text-left text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
      >
        <span className={selectedOption ? 'text-text-primary' : 'text-text-muted'}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          aria-activedescendant={`${controlId}-option-${activeIndex}`}
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card focus:outline-none"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${controlId}-option-${index}`}
              role="option"
              aria-selected={value === option.value}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ${
                index === activeIndex
                  ? 'bg-brand-soft text-brand'
                  : 'text-text-primary hover:bg-surface-muted'
              }`}
            >
              <span>{option.label}</span>
              {value === option.value && (
                <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default Dropdown
