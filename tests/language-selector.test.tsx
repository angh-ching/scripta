import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LanguageSelector } from '../src/components/language/LanguageSelector'

describe('LanguageSelector', () => {
  it('searches the language list and reports the chosen code', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<LanguageSelector value="en" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Translate to: English' }))
    const search = screen.getByRole('combobox', { name: 'Search languages' })
    await user.type(search, 'japan')

    const option = screen.getByRole('option', { name: /Japanese/ })
    await user.click(option)

    expect(onChange).toHaveBeenCalledWith('ja')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('can offer auto-detect as a source option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<LanguageSelector value="en" onChange={onChange} allowAuto ariaLabel="From" />)

    await user.click(screen.getByRole('button', { name: 'From: English' }))
    await user.click(screen.getByRole('option', { name: /Auto-detect/ }))

    expect(onChange).toHaveBeenCalledWith('auto')
  })
})
