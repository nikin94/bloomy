import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '@/context/authContext'
import { SettingsContext } from '@/context/settingsContext'
import type { SettingsState } from '@/context/settingsContext'

// The account section imports signOutUser; keep the real Firebase SDK out of the test.
const signOutUser = vi.fn()
vi.mock('../../firebase/auth', () => ({ signOutUser: (...args: unknown[]) => signOutUser(...args) }))

// Imported after the mock above is registered.
import SettingsPage from './SettingsPage'

const saveSettings = vi.fn()

const settings = (over: Partial<SettingsState> = {}): SettingsState => ({
  fontScale: 1,
  theme: 'dark',
  language: 'ru',
  defaultDeliveryMethod: 'post',
  defaultPaymentMethod: 'cash',
  defaultCurrency: 'RUB',
  saveSettings,
  ...over,
})

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// The page AUTOSAVES on every field change — there is no Save/Cancel footer, no
// drafts and no leave-guard anymore, so a plain <MemoryRouter> suffices (the old
// useBlocker needed a data router). The active section travels in `?section=`.
const renderPage = (state = settings(), section = 'appearance') =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <SettingsContext.Provider value={state}>
        <MemoryRouter initialEntries={[`/settings?section=${section}`]}>
          <SettingsPage />
        </MemoryRouter>
      </SettingsContext.Provider>
    </AuthContext.Provider>,
  )

const slider = () => screen.getByRole('slider', { name: 'Размер шрифта' })
const themeSwitch = () => screen.getByRole('switch', { name: 'Тёмная тема' })

beforeEach(() => {
  vi.clearAllMocks()
  signOutUser.mockResolvedValue(undefined)
})

describe('SettingsPage', () => {
  it('renders the section from the URL — appearance shows the font-size slider', () => {
    renderPage()
    expect(slider()).toBeInTheDocument()
    // Appearance is not an account section, so no sign-out here.
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument()
  })

  it('shows no Save/Cancel buttons anywhere — settings persist on change', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отмена' })).not.toBeInTheDocument()
  })

  it('shows the user name and sign-out on the account section', () => {
    renderPage(settings(), 'account')
    expect(screen.getByText('Tester')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('falls back to appearance for an unknown section param', () => {
    renderPage(settings(), 'nope')
    expect(slider()).toBeInTheDocument()
  })

  it('saves the theme immediately when toggled', async () => {
    const user = userEvent.setup()
    renderPage(settings({ theme: 'dark' }))
    expect(themeSwitch()).toBeChecked()
    await user.click(themeSwitch())
    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(saveSettings).toHaveBeenCalledWith({
      fontScale: 1,
      theme: 'light',
      language: 'ru',
      defaultDeliveryMethod: 'post',
      defaultPaymentMethod: 'cash',
      defaultCurrency: 'RUB',
    })
  })

  it('saves a keyboard font-size step immediately', () => {
    renderPage()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 1.25 }))
  })

  it('holds the save during a pointer drag and commits ONCE on release', () => {
    renderPage()
    const s = slider()
    fireEvent.pointerDown(s)
    fireEvent.change(s, { target: { value: '1.25' } })
    fireEvent.change(s, { target: { value: '1.375' } })
    // Mid-drag: the thumb moves (local draft) but nothing is saved yet.
    expect(saveSettings).not.toHaveBeenCalled()
    fireEvent.pointerUp(s)
    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 1.375 }))
  })

  it('re-syncs the slider thumb when the saved scale resolves after mount', () => {
    // Settings load async: the page can mount on the default (1) before the
    // user's stored scale arrives. The thumb must follow the resolved value.
    const { rerender } = renderPage(settings({ fontScale: 1 }))
    expect(slider()).toHaveValue('1')
    rerender(
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <SettingsContext.Provider value={settings({ fontScale: 1.25 })}>
          <MemoryRouter initialEntries={['/settings?section=appearance']}>
            <SettingsPage />
          </MemoryRouter>
        </SettingsContext.Provider>
      </AuthContext.Provider>,
    )
    expect(slider()).toHaveValue('1.25')
  })

  it('saves the chosen language immediately', async () => {
    const user = userEvent.setup()
    renderPage(settings({ language: 'ru' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Язык интерфейса' }), 'en')
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }))
  })

  it('saves each changed order default immediately (delivery, payment, currency)', async () => {
    const user = userEvent.setup()
    renderPage(settings(), 'orders')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Способ доставки по умолчанию' }),
      'cdek',
    )
    expect(saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultDeliveryMethod: 'cdek' }),
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Способ оплаты по умолчанию' }),
      'card',
    )
    expect(saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPaymentMethod: 'card' }),
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Валюта по умолчанию' }), 'USD')
    expect(saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultCurrency: 'USD' }),
    )
    expect(saveSettings).toHaveBeenCalledTimes(3)
  })

  it('signs out from the account section', async () => {
    const user = userEvent.setup()
    renderPage(settings(), 'account')
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
  })

  it('surfaces a sign-out failure inline', async () => {
    const user = userEvent.setup()
    signOutUser.mockRejectedValueOnce(new Error('Сеть недоступна'))
    renderPage(settings(), 'account')
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна')
  })
})
