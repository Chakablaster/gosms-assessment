import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Dropdown from '../components/Dropdown'

const options = [
  { value: 'silvertree', label: 'Silvertree Restaurants' },
  { value: 'gordon-grill', label: 'Gordon Grill' },
  { value: 'normans-cafe', label: "Norman's Cafe" },
]

function renderDropdown(value = '') {
  const onChange = vi.fn()
  render(
    <Dropdown
      id="test-brand"
      label="Client Brand"
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Select a brand"
    />
  )
  return onChange
}

describe('Dropdown', () => {
  it('shows the placeholder and opens its options', () => {
    renderDropdown()

    const trigger = screen.getByRole('button', { name: 'Client Brand' })
    expect(trigger).toHaveTextContent('Select a brand')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: 'Client Brand' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('selects an option by mouse and closes the list', () => {
    const onChange = renderDropdown()

    fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
    fireEvent.click(screen.getByRole('option', { name: 'Gordon Grill' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('gordon-grill')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Client Brand' })).toHaveFocus()
  })

  it('displays the current selection', () => {
    renderDropdown('normans-cafe')

    const trigger = screen.getByRole('button', { name: 'Client Brand' })
    expect(trigger).toHaveTextContent("Norman's Cafe")

    fireEvent.click(trigger)
    expect(screen.getByRole('option', { name: "Norman's Cafe" })).toHaveAttribute('aria-selected', 'true')
  })

  it('supports arrow keys and Enter to select an option', () => {
    const onChange = renderDropdown()
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveFocus()

    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    fireEvent.keyDown(listbox, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('gordon-grill')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes with Escape without changing the selection', () => {
    const onChange = renderDropdown()
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes when clicking outside', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
