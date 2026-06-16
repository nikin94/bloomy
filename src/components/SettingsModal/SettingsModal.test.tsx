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
const saveSettings = vi.fn()
const onClose = vi.fn()

const settings = (over: Partial<SettingsState> = {}): SettingsState => ({
  fontScale: 1,
  theme: 'dark',
  defaultDeliveryMethod: 'post',
  defaultPaymentMethod: 'cash',
  previewFontScale,
  previewTheme,
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

  it('shows the font-size slider and sign-out when open', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Настройки' })).toBeInTheDocument()
    expect(slider()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('shows the signed-in user name alongside sign-out (moved out of the header)', () => {
    renderModal()
    expect(screen.getByText('Tester')).toBeInTheDocument()
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

  it('persists the chosen size and theme only on Save, then closes', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1, theme: 'dark' }))
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(themeSwitch()) // dark → light
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(saveSettings).toHaveBeenCalledWith({
      fontScale: 1.25,
      theme: 'light',
      defaultDeliveryMethod: 'post',
      defaultPaymentMethod: 'cash',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('saves the chosen order defaults (delivery + payment)', async () => {
    const user = userEvent.setup()
    renderModal()
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

  it('reverts the live preview to the saved values on cancel, without saving', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1, theme: 'dark' }))
    fireEvent.change(slider(), { target: { value: '1.375' } })
    await user.click(themeSwitch()) // preview light
    previewFontScale.mockClear()
    previewTheme.mockClear()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    // Both previews revert to the persisted values.
    expect(previewFontScale).toHaveBeenLastCalledWith(1)
    expect(previewTheme).toHaveBeenLastCalledWith('dark')
    expect(saveSettings).not.toHaveBeenCalled()
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
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
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
    const last = screen.getByRole('button', { name: 'Выйти' })

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
