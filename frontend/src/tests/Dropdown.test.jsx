import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Dropdown from '../components/Dropdown'

const options = [
  { value: 'silvertree', label: 'Silvertree Restaurants' },
  { value: 'gordon-grill', label: 'Gordon Grill' },
  { value: 'normans-cafe', label: "Norman's Cafe" },
]

function renderDropdown(value = '', availableOptions = options) {
  const onChange = vi.fn()
  render(
    <Dropdown
      id="test-brand"
      label="Client Brand"
      options={availableOptions}
      value={value}
      onChange={onChange}
      placeholder="Select a brand"
    />
  )
  return onChange
}

describe('brand dropdown', () => {
  // Before a brand is chosen, the field should explain what the user needs to select.
  // Opening it must expose all available brands with the correct accessible label.
  it('shows its placeholder and opens the brand list', () => {
    renderDropdown()
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    expect(trigger).toHaveTextContent('Select a brand')
    expect(trigger).toHaveAccessibleDescription('Select a brand')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: 'Client Brand' })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(options.length)
  })

  // Choosing a brand with the mouse should report its ID to the parent, close the
  // list and return focus to the trigger so the user can continue from there.
  it('selects a brand with the mouse and returns focus to the field', () => {
    const onChange = renderDropdown()
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('option', { name: 'Gordon Grill' }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('gordon-grill')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  // The selected brand belongs to the parent component, not the dropdown's local
  // state. When the parent changes the value, the visible and accessible selection
  // must both follow it without firing another change event.
  it('displays the selection supplied by the parent and responds to updates', () => {
    const onChange = vi.fn()
    const props = { id: 'test-brand', label: 'Client Brand', options, onChange, placeholder: 'Select a brand' }
    const { rerender } = render(<Dropdown {...props} value="silvertree" />)
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    expect(trigger).toHaveTextContent('Silvertree Restaurants')
    rerender(<Dropdown {...props} value="normans-cafe" />)

    expect(trigger).toHaveTextContent("Norman's Cafe")
    expect(trigger).toHaveAccessibleDescription("Norman's Cafe")
    fireEvent.click(trigger)
    expect(screen.getByRole('option', { name: "Norman's Cafe" })).toHaveAttribute('aria-selected', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  // Arrow Down must open the list for keyboard users, and Enter must select the
  // highlighted brand. Mouse input must not be required to complete this field.
  it('supports Arrow Down navigation and Enter selection', () => {
    const onChange = renderDropdown()
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveFocus()

    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    fireEvent.keyDown(listbox, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('gordon-grill')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  // Opening with Arrow Up should start at the last brand when nothing is selected.
  // This allows someone navigating backwards to reach the end without extra keys.
  it('opens at the last option when Arrow Up is pressed on an empty field', () => {
    const onChange = renderDropdown()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Client Brand' }), { key: 'ArrowUp' })
    const listbox = screen.getByRole('listbox')
    const lastOption = screen.getByRole('option', { name: "Norman's Cafe" })

    expect(listbox).toHaveAttribute('aria-activedescendant', lastOption.id)
    fireEvent.keyDown(listbox, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('normans-cafe')
  })

  // Keyboard navigation should wrap at both ends instead of trapping the user
  // on the first or last brand. Space should select the currently highlighted item.
  it('wraps arrow key navigation and accepts Space to select', () => {
    const onChange = renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
    const listbox = screen.getByRole('listbox')
    const firstOption = screen.getByRole('option', { name: 'Silvertree Restaurants' })
    const lastOption = screen.getByRole('option', { name: "Norman's Cafe" })

    fireEvent.keyDown(listbox, { key: 'ArrowUp' })
    expect(listbox).toHaveAttribute('aria-activedescendant', lastOption.id)

    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(listbox).toHaveAttribute('aria-activedescendant', firstOption.id)

    fireEvent.keyDown(listbox, { key: 'ArrowUp' })
    fireEvent.keyDown(listbox, { key: ' ' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('normans-cafe')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  // Home and End provide a faster way through the list than pressing an arrow
  // repeatedly. The active option should change without selecting a brand yet.
  it('moves to the first and last brands with Home and End', () => {
    const onChange = renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
    const listbox = screen.getByRole('listbox')
    const firstOption = screen.getByRole('option', { name: 'Silvertree Restaurants' })
    const lastOption = screen.getByRole('option', { name: "Norman's Cafe" })

    fireEvent.keyDown(listbox, { key: 'End' })
    expect(listbox).toHaveAttribute('aria-activedescendant', lastOption.id)
    fireEvent.keyDown(listbox, { key: 'Home' })
    expect(listbox).toHaveAttribute('aria-activedescendant', firstOption.id)
    expect(onChange).not.toHaveBeenCalled()
  })

  // Escape should abandon selection and restore focus to the field. Closing a
  // list with the keyboard must not silently change the chosen business.
  it('closes with Escape without changing the selected brand', () => {
    const onChange = renderDropdown('silvertree')
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveTextContent('Silvertree Restaurants')
    expect(onChange).not.toHaveBeenCalled()
  })

  // Clicking elsewhere should dismiss the brand list so it does not cover the
  // rest of the form. A click outside must not trigger a brand change.
  it('closes when the user clicks outside the dropdown', () => {
    const onChange = renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  // The trigger also acts as the toggle for the list. Clicking it again should
  // close the options without choosing one, matching normal dropdown behaviour.
  it('closes when the trigger is clicked a second time', () => {
    const onChange = renderDropdown()
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.click(trigger)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(onChange).not.toHaveBeenCalled()
  })

  // If the backend provides no brands, there is nothing the user can choose.
  // Disabling the field avoids opening an empty menu or reporting a false selection.
  it('disables the field when there are no options', () => {
    const onChange = renderDropdown('', [])
    const trigger = screen.getByRole('button', { name: 'Client Brand' })

    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  // Tabbing away from an open list should close it, just as clicking outside
  // does. Otherwise the menu could remain visible while focus moves to a new field.
  it('closes when keyboard focus leaves the dropdown', () => {
    const onChange = vi.fn()
    render(
      <>
        <Dropdown id="test-brand" label="Client Brand" options={options} value="" onChange={onChange} />
        <button type="button">Next field</button>
      </>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Client Brand' }))
    fireEvent.blur(screen.getByRole('listbox'), {
      relatedTarget: screen.getByRole('button', { name: 'Next field' }),
    })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })
})
