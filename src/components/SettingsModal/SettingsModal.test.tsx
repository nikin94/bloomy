import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import { SettingsContext } from '../../context/settingsContext'
import type { SettingsState } from '../../context/settingsContext'

// The dialog imports signOutUser; keep the real Firebase SDK out of the test.
const signOutUser = vi.fn()
vi.mock('../../firebase/auth', () => ({ signOutUser: (...args: unknown[]) => signOutUser(...args) }))

// Imported after the mock above is registered.
import SettingsModal from './SettingsModal'

const previewFontScale = vi.fn()
const previewTheme = vi.fn()
const previewLanguage = vi.fn()
const saveSettings = vi.fn()
const onClose = vi.fn()

const settings = (over: Partial<SettingsState> = {}): SettingsState => ({
  fontScale: 1,
  theme: 'dark',
  language: 'ru',
  defaultDeliveryMethod: 'post',
  defaultPaymentMethod: 'cash',
  defaultCurrency: 'RUB',
  previewFontScale,
  previewTheme,
  previewLanguage,
  saveSettings,
  ...over,
})

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const renderModal = (open = true, state = settings()) =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <SettingsContext.Provider value={state}>
        <SettingsModal open={open} onClose={onClose} />
      </SettingsContext.Provider>
    </AuthContext.Provider>,
  )

const slider = () => screen.getByRole('slider', { name: 'Размер шрифта' })

const themeSwitch = () => screen.getByRole('switch', { name: 'Тёмная тема' })

// Settings are split across header tabs; jump to one by its label.
const tab = (name: string) => screen.getByRole('tab', { name })
const goToTab = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(tab(name))

beforeEach(() => {
  vi.clearAllMocks()
  saveSettings.mockResolvedValue(undefined)
  signOutUser.mockResolvedValue(undefined)
})

describe('SettingsModal', () => {
  it('renders nothing when closed', () => {
    renderModal(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on the Appearance tab with the font-size slider', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeInTheDocument()
    expect(tab('Оформление')).toHaveAttribute('aria-selected', 'true')
    expect(slider()).toBeInTheDocument()
  })

  it('shows the user name and sign-out on the Account tab', async () => {
    const user = userEvent.setup()
    renderModal()
    // Sign-out and the name live on the Account tab now, not the action row.
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument()
    await goToTab(user, 'Аккаунт')
    expect(screen.getByText('Tester')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('switches tabs with arrow keys (ARIA tabs pattern)', async () => {
    const user = userEvent.setup()
    renderModal()
    tab('Оформление').focus()
    await user.keyboard('{ArrowRight}')
    expect(tab('Заказы')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Заказы')).toHaveFocus()
    expect(screen.getByRole('combobox', { name: 'Способ доставки по умолчанию' })).toBeInTheDocument()
  })

  it('reflects the current theme and toggles it live without persisting', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ theme: 'dark' }))
    // The switch is "on" for dark…
    expect(themeSwitch()).toBeChecked()
    await user.click(themeSwitch())
    // …toggling to light previews live, switch flips, nothing persisted yet.
    expect(previewTheme).toHaveBeenCalledWith('light')
    expect(themeSwitch()).not.toBeChecked()
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('previews the size live as the slider moves, without persisting', () => {
    renderModal()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    expect(previewFontScale).toHaveBeenCalledWith(1.25)
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('tints only the row whose draft differs from the saved value', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ theme: 'dark' }))
    // The theme row's container holds the switch; untouched, it carries no tint.
    const themeRow = themeSwitch().parentElement as HTMLElement
    expect(themeRow.className).not.toContain('bg-accent-bg')
    // Editing the theme tints its row, leaving the others (e.g. language) untinted.
    await user.click(themeSwitch())
    expect(themeRow.className).toContain('bg-accent-bg')
    const languageRow = screen.getByRole('combobox', { name: 'Язык интерфейса' }).closest('.flex')
    expect(languageRow?.className).not.toContain('bg-accent-bg')
  })

  it('persists the chosen size and theme only on Save, then closes', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1, theme: 'dark' }))
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(themeSwitch()) // dark → light
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(saveSettings).toHaveBeenCalledWith({
      fontScale: 1.25,
      theme: 'light',
      language: 'ru',
      defaultDeliveryMethod: 'post',
      defaultPaymentMethod: 'cash',
      defaultCurrency: 'RUB',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('previews the chosen language live and persists it on Save', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ language: 'ru' }))
    // Switching the language picker re-renders the app immediately (preview)…
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Язык интерфейса' }),
      'en',
    )
    expect(previewLanguage).toHaveBeenCalledWith('en')
    expect(saveSettings).not.toHaveBeenCalled()
    // …and Save persists it alongside the other settings.
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }))
  })

  it('saves the chosen order defaults (delivery + payment)', async () => {
    const user = userEvent.setup()
    renderModal()
    await goToTab(user, 'Заказы')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Способ доставки по умолчанию' }),
      'cdek',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Способ оплаты по умолчанию' }),
      'card',
    )
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultDeliveryMethod: 'cdek', defaultPaymentMethod: 'card' }),
    )
  })

  it('saves the chosen default currency', async () => {
    const user = userEvent.setup()
    renderModal()
    await goToTab(user, 'Заказы')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Валюта по умолчанию' }), 'USD')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultCurrency: 'USD' }))
  })

  it('reverts the live preview to the saved values on cancel, without saving', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1, theme: 'dark' }))
    fireEvent.change(slider(), { target: { value: '1.375' } })
    await user.click(themeSwitch()) // preview light
    previewFontScale.mockClear()
    previewTheme.mockClear()
    previewLanguage.mockClear()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    // Every live preview reverts to the persisted values.
    expect(previewFontScale).toHaveBeenLastCalledWith(1)
    expect(previewTheme).toHaveBeenLastCalledWith('dark')
    expect(previewLanguage).toHaveBeenLastCalledWith('ru')
    expect(saveSettings).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('asks to confirm before discarding unsaved changes when dismissed via X', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1 }))
    fireEvent.change(slider(), { target: { value: '1.25' } })
    // The header X is a dismissal route, so with unsaved edits it confirms first.
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.getByText('Несохранённые изменения')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the dialog open when the discard confirm is dismissed', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1 }))
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await user.click(screen.getByRole('button', { name: 'Продолжить редактирование' }))
    expect(screen.queryByText('Несохранённые изменения')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('returns focus to the editing control when the discard confirm is dismissed', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1 }))
    // Focus the slider, edit it, then dismiss via Escape (focus stays on the
    // slider) to raise the confirm.
    slider().focus()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.keyboard('{Escape}')
    // The confirm is an alertdialog announcing its own title/body.
    const confirm = screen.getByRole('alertdialog', { name: 'Несохранённые изменения' })
    expect(confirm).toBeInTheDocument()
    // Keep editing → focus returns to where the user was, not to document.body.
    await user.click(screen.getByRole('button', { name: 'Продолжить редактирование' }))
    expect(slider()).toHaveFocus()
  })

  it('disables sign-out while a save is in flight', async () => {
    const user = userEvent.setup()
    // Hold the save pending so `saving` stays true.
    saveSettings.mockReturnValueOnce(new Promise(() => {}))
    renderModal()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await goToTab(user, 'Аккаунт')
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeDisabled()
  })

  it('discards unsaved changes and reverts the preview on confirm', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1 }))
    fireEvent.change(slider(), { target: { value: '1.25' } })
    previewFontScale.mockClear()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await user.click(screen.getByRole('button', { name: 'Закрыть без сохранения' }))
    expect(previewFontScale).toHaveBeenLastCalledWith(1) // reverted to the saved value
    expect(saveSettings).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes immediately via X when there are no unsaved changes', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByText('Несохранённые изменения')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces a save error and re-enables the button without closing', async () => {
    const user = userEvent.setup()
    saveSettings.mockRejectedValueOnce(new Error('Сбой сети'))
    renderModal()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Сбой сети')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  })

  it('signs out from the dialog', async () => {
    const user = userEvent.setup()
    renderModal()
    await goToTab(user, 'Аккаунт')
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
  })

  it('surfaces a sign-out failure inline and keeps the dialog open', async () => {
    const user = userEvent.setup()
    signOutUser.mockRejectedValueOnce(new Error('Сеть недоступна'))
    renderModal()
    await goToTab(user, 'Аккаунт')
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    // The failure is announced (so the user knows they're still signed in) and
    // the dialog is not dismissed.
    expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus into the dialog when it opens', () => {
    renderModal()
    // The first focusable control (the close button) receives focus on open.
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus()
  })

  it('traps Tab within the dialog, wrapping at both ends', async () => {
    const user = userEvent.setup()
    renderModal()
    const first = screen.getByRole('button', { name: 'Закрыть' })
    // Sign-out moved up into the action row, so Cancel is now the last focusable.
    const last = screen.getByRole('button', { name: 'Отмена' })

    // Tab from the last focusable wraps back to the first.
    last.focus()
    await user.tab()
    expect(first).toHaveFocus()

    // Shift+Tab from the first wraps to the last.
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('restores focus to the opener when the dialog closes', async () => {
    const user = userEvent.setup()
    const Harness = () => {
      const [open, setOpen] = useState(false)
      return (
        <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
          <SettingsContext.Provider value={settings()}>
            <button onClick={() => setOpen(true)}>Открыть</button>
            <SettingsModal open={open} onClose={() => setOpen(false)} />
          </SettingsContext.Provider>
        </AuthContext.Provider>
      )
    }
    render(<Harness />)

    const opener = screen.getByRole('button', { name: 'Открыть' })
    opener.focus()
    await user.click(opener)
    // Dialog opened and grabbed focus; closing returns it to the opener.
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(opener).toHaveFocus()
  })
})
