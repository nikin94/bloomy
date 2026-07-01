import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'
import { SettingsContext } from '../../context/settingsContext'
import type { SettingsState } from '../../context/settingsContext'

// The account tab imports signOutUser; keep the real Firebase SDK out of the test.
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

// The page needs no router (it has no links / navigation hooks) — just the auth
// and settings contexts, like the former dialog. Returns the RTL result so tests
// can unmount to exercise the leave-time preview revert.
const renderPage = (state = settings()) =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
      <SettingsContext.Provider value={state}>
        <SettingsPage />
      </SettingsContext.Provider>
    </AuthContext.Provider>,
  )

const slider = () => screen.getByRole('slider', { name: 'Размер шрифта' })
const themeSwitch = () => screen.getByRole('switch', { name: 'Тёмная тема' })
const saveButton = () => screen.getByRole('button', { name: 'Сохранить' })
const cancelButton = () => screen.getByRole('button', { name: 'Отмена' })

// Settings are split across tabs; jump to one by its label.
const tab = (name: string) => screen.getByRole('tab', { name })
const goToTab = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(tab(name))

beforeEach(() => {
  vi.clearAllMocks()
  saveSettings.mockResolvedValue(undefined)
  signOutUser.mockResolvedValue(undefined)
})

describe('SettingsPage', () => {
  it('renders the settings heading and opens on the Appearance tab', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Настройки' })).toBeInTheDocument()
    expect(tab('Внешний вид')).toHaveAttribute('aria-selected', 'true')
    expect(slider()).toBeInTheDocument()
  })

  it('shows the user name and sign-out on the Account tab', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument()
    await goToTab(user, 'Аккаунт')
    expect(screen.getByText('Tester')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('switches tabs with arrow keys (ARIA tabs pattern)', async () => {
    const user = userEvent.setup()
    renderPage()
    tab('Внешний вид').focus()
    await user.keyboard('{ArrowRight}')
    expect(tab('Заказы')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Заказы')).toHaveFocus()
    expect(screen.getByRole('combobox', { name: 'Способ доставки по умолчанию' })).toBeInTheDocument()
  })

  it('navigates sections via the phone section picker (mobile control)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Разделы настроек' }), 'orders')
    expect(screen.getByRole('combobox', { name: 'Способ доставки по умолчанию' })).toBeInTheDocument()
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
    renderPage()
    await goToTab(user, 'Заказы')
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
    renderPage()
    await goToTab(user, 'Заказы')
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
    renderPage()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(saveButton())
    await goToTab(user, 'Аккаунт')
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeDisabled()
  })

  it('signs out from the account tab', async () => {
    const user = userEvent.setup()
    renderPage()
    await goToTab(user, 'Аккаунт')
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
  })

  it('surfaces a sign-out failure inline', async () => {
    const user = userEvent.setup()
    signOutUser.mockRejectedValueOnce(new Error('Сеть недоступна'))
    renderPage()
    await goToTab(user, 'Аккаунт')
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна')
  })
})
