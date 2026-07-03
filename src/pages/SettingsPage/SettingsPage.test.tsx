import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useSearchParams } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '@/context/authContext'
import { SettingsContext } from '@/context/settingsContext'
import type { SettingsState } from '@/context/settingsContext'

// The account section imports signOutUser; keep the real Firebase SDK out of the test.
const signOutUser = vi.fn()
vi.mock('../../firebase/auth', () => ({ signOutUser: (...args: unknown[]) => signOutUser(...args) }))

// Imported after the mock above is registered.
import SettingsPage from './SettingsPage'

const previewFontScale = vi.fn()
const previewTheme = vi.fn()
const previewLanguage = vi.fn()
const saveSettings = vi.fn()

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

// The active section travels in the URL (`?section=`), and the page arms
// useBlocker — which requires a DATA router — so tests build a createMemoryRouter
// (not <MemoryRouter>) at the section under test. Returns the RTL result so tests
// can unmount to exercise the leave-time preview revert.
const renderPage = (state = settings(), section = 'appearance') => {
  const router = createMemoryRouter([{ path: '/settings', element: <SettingsPage /> }], {
    initialEntries: [`/settings?section=${section}`],
  })
  return render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <SettingsContext.Provider value={state}>
        <RouterProvider router={router} />
      </SettingsContext.Provider>
    </AuthContext.Provider>,
  )
}

// Renders the page plus an in-router section switcher (a sibling that flips
// ?section=account), so a test can switch sections while keeping the page
// MOUNTED. A same-path ?section= switch is intentionally NOT blocked by useBlocker.
const renderWithSwitcher = (state = settings()) => {
  const SectionSwitcher = () => {
    const [, setParams] = useSearchParams()
    return (
      <button type="button" onClick={() => setParams({ section: 'account' })}>
        go-account
      </button>
    )
  }
  const router = createMemoryRouter(
    [
      {
        path: '/settings',
        element: (
          <>
            <SettingsPage />
            <SectionSwitcher />
          </>
        ),
      },
    ],
    { initialEntries: ['/settings?section=appearance'] },
  )
  return render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <SettingsContext.Provider value={state}>
        <RouterProvider router={router} />
      </SettingsContext.Provider>
    </AuthContext.Provider>,
  )
}

const slider = () => screen.getByRole('slider', { name: 'Размер шрифта' })
const themeSwitch = () => screen.getByRole('switch', { name: 'Тёмная тема' })
const saveButton = () => screen.getByRole('button', { name: 'Сохранить' })
const cancelButton = () => screen.getByRole('button', { name: 'Отмена' })

beforeEach(() => {
  vi.clearAllMocks()
  saveSettings.mockResolvedValue(undefined)
  signOutUser.mockResolvedValue(undefined)
})

describe('SettingsPage', () => {
  it('renders the section from the URL — appearance shows the font-size slider', () => {
    renderPage()
    expect(slider()).toBeInTheDocument()
    // Appearance is not an account section, so no sign-out here.
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument()
  })

  it('shows the user name and sign-out on the account section', () => {
    renderPage(settings(), 'account')
    expect(screen.getByText('Tester')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
    // Account is action-only → no Save/Cancel footer.
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
  })

  it('falls back to appearance for an unknown section param', () => {
    renderPage(settings(), 'nope')
    expect(slider()).toBeInTheDocument()
  })

  it('reflects the current theme and toggles it live without persisting', async () => {
    const user = userEvent.setup()
    renderPage(settings({ theme: 'dark' }))
    expect(themeSwitch()).toBeChecked()
    await user.click(themeSwitch())
    expect(previewTheme).toHaveBeenCalledWith('light')
    expect(themeSwitch()).not.toBeChecked()
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('previews the size live when changed without a pointer drag (e.g. keyboard)', () => {
    renderPage()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    expect(previewFontScale).toHaveBeenCalledWith(1.25)
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('holds the font preview during a pointer drag and applies it once on release', () => {
    renderPage()
    const s = slider()
    fireEvent.pointerDown(s)
    fireEvent.change(s, { target: { value: '1.25' } })
    fireEvent.change(s, { target: { value: '1.375' } })
    expect(previewFontScale).not.toHaveBeenCalled()
    fireEvent.pointerUp(s)
    expect(previewFontScale).toHaveBeenCalledTimes(1)
    expect(previewFontScale).toHaveBeenCalledWith(1.375)
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('keeps Save disabled until there are unsaved changes', () => {
    renderPage()
    // Nothing edited yet → nothing to save.
    expect(saveButton()).toBeDisabled()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    expect(saveButton()).toBeEnabled()
  })

  it('persists the chosen size and theme only on Save, then confirms', async () => {
    const user = userEvent.setup()
    renderPage(settings({ fontScale: 1, theme: 'dark' }))
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(themeSwitch()) // dark → light
    await user.click(saveButton())
    expect(saveSettings).toHaveBeenCalledWith({
      fontScale: 1.25,
      theme: 'light',
      language: 'ru',
      defaultDeliveryMethod: 'post',
      defaultPaymentMethod: 'cash',
      defaultCurrency: 'RUB',
    })
    // The page stays put and confirms the save (no dialog to close).
    expect(await screen.findByText('Сохранено')).toBeInTheDocument()
  })

  it('previews the chosen language live and persists it on Save', async () => {
    const user = userEvent.setup()
    renderPage(settings({ language: 'ru' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Язык интерфейса' }), 'en')
    expect(previewLanguage).toHaveBeenCalledWith('en')
    expect(saveSettings).not.toHaveBeenCalled()
    await user.click(saveButton())
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }))
  })

  it('saves the chosen order defaults (delivery + payment)', async () => {
    const user = userEvent.setup()
    renderPage(settings(), 'orders')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Способ доставки по умолчанию' }),
      'cdek',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Способ оплаты по умолчанию' }),
      'card',
    )
    await user.click(saveButton())
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultDeliveryMethod: 'cdek', defaultPaymentMethod: 'card' }),
    )
  })

  it('saves the chosen default currency', async () => {
    const user = userEvent.setup()
    renderPage(settings(), 'orders')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Валюта по умолчанию' }), 'USD')
    await user.click(saveButton())
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultCurrency: 'USD' }))
  })

  it('reverts the live preview and the drafts in place on Cancel, without saving', async () => {
    const user = userEvent.setup()
    renderPage(settings({ fontScale: 1, theme: 'dark' }))
    fireEvent.change(slider(), { target: { value: '1.375' } })
    await user.click(themeSwitch()) // preview light
    previewFontScale.mockClear()
    previewTheme.mockClear()
    previewLanguage.mockClear()
    await user.click(cancelButton())
    // Every live preview reverts to the persisted values, nothing saved.
    expect(previewFontScale).toHaveBeenLastCalledWith(1)
    expect(previewTheme).toHaveBeenLastCalledWith('dark')
    expect(previewLanguage).toHaveBeenLastCalledWith('ru')
    expect(saveSettings).not.toHaveBeenCalled()
    // Drafts reset → nothing to save, so Save is disabled again.
    expect(saveButton()).toBeDisabled()
  })

  it('reverts the live preview to the saved values when the page unmounts', () => {
    const { unmount } = renderPage(settings({ fontScale: 1, theme: 'dark', language: 'ru' }))
    // Edit (live preview applied) but do NOT save…
    fireEvent.change(slider(), { target: { value: '1.375' } })
    previewFontScale.mockClear()
    previewTheme.mockClear()
    previewLanguage.mockClear()
    // …then leave the page: the app must not keep the unsaved appearance.
    unmount()
    expect(previewFontScale).toHaveBeenLastCalledWith(1)
    expect(previewTheme).toHaveBeenLastCalledWith('dark')
    expect(previewLanguage).toHaveBeenLastCalledWith('ru')
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('surfaces a save error and re-enables the button without confirming', async () => {
    const user = userEvent.setup()
    saveSettings.mockRejectedValueOnce(new Error('Сбой сети'))
    renderPage()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Сбой сети')
    expect(screen.queryByText('Сохранено')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('disables sign-out while a save is in flight', async () => {
    const user = userEvent.setup()
    saveSettings.mockReturnValueOnce(new Promise(() => {}))
    // Render the page plus an in-router section switcher, so switching from the
    // appearance section (where Save lives) to the account section keeps the page
    // MOUNTED — the in-flight `saving` state must persist across the switch.
    renderWithSwitcher()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(saveButton())
    await user.click(screen.getByRole('button', { name: 'go-account' }))
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeDisabled()
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

  it('shows the unsaved-changes hint on a footerless section when drafts are dirty', async () => {
    const user = userEvent.setup()
    // Edit on Appearance (where Save lives), then switch to the footerless Account
    // section: the drafts survive but the Save/Cancel footer is gone, so the banner
    // reassures the user the change isn't lost.
    renderWithSwitcher()
    // Pristine appearance → no hint (footer carries Save there anyway).
    expect(screen.queryByText(/несохранённые изменения/i)).not.toBeInTheDocument()
    await user.click(themeSwitch()) // make the drafts dirty
    await user.click(screen.getByRole('button', { name: 'go-account' }))
    // The section switch is same-path, so it must NOT trip the leave-guard dialog…
    expect(screen.queryByRole('button', { name: 'Уйти' })).not.toBeInTheDocument()
    // …and the drafts survive, so the hint shows on the footerless section.
    expect(screen.getByText(/несохранённые изменения/i)).toBeInTheDocument()
  })

  it('guards an in-app leave with unsaved changes: Stay cancels, Leave proceeds', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [
        { path: '/settings', element: <SettingsPage /> },
        { path: '/orders', element: <div>orders-page</div> },
      ],
      { initialEntries: ['/settings?section=appearance'] },
    )
    render(
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <SettingsContext.Provider value={settings()}>
          <RouterProvider router={router} />
        </SettingsContext.Provider>
      </AuthContext.Provider>,
    )
    // Make the drafts dirty, then attempt to leave /settings entirely.
    await user.click(themeSwitch())
    await act(async () => {
      await router.navigate('/orders')
    })
    // The guard holds the navigation and asks to confirm.
    expect(await screen.findByText(/Уйти со страницы без сохранения/i)).toBeInTheDocument()
    expect(screen.queryByText('orders-page')).not.toBeInTheDocument()

    // "Остаться" cancels — we stay on the settings page.
    await user.click(screen.getByRole('button', { name: 'Остаться' }))
    expect(slider()).toBeInTheDocument()
    expect(screen.queryByText('orders-page')).not.toBeInTheDocument()

    // Attempt again, then "Уйти" — navigation proceeds to the orders route.
    await act(async () => {
      await router.navigate('/orders')
    })
    await user.click(await screen.findByRole('button', { name: 'Уйти' }))
    expect(await screen.findByText('orders-page')).toBeInTheDocument()
  })
})
