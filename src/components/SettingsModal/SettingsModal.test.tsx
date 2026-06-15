import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsContext } from '../../context/settingsContext'
import type { SettingsState } from '../../context/settingsContext'

// The dialog imports signOutUser; keep the real Firebase SDK out of the test.
const signOutUser = vi.fn()
vi.mock('../../firebase/auth', () => ({ signOutUser: (...args: unknown[]) => signOutUser(...args) }))

// Imported after the mock above is registered.
import SettingsModal from './SettingsModal'

const previewFontScale = vi.fn()
const saveFontScale = vi.fn()
const onClose = vi.fn()

const settings = (over: Partial<SettingsState> = {}): SettingsState => ({
  fontScale: 1,
  previewFontScale,
  saveFontScale,
  ...over,
})

const renderModal = (open = true, state = settings()) =>
  render(
    <SettingsContext.Provider value={state}>
      <SettingsModal open={open} onClose={onClose} />
    </SettingsContext.Provider>,
  )

const slider = () => screen.getByRole('slider', { name: 'Размер шрифта' })

beforeEach(() => {
  vi.clearAllMocks()
  saveFontScale.mockResolvedValue(undefined)
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

  it('previews the size live as the slider moves, without persisting', () => {
    renderModal()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    expect(previewFontScale).toHaveBeenCalledWith(1.25)
    expect(saveFontScale).not.toHaveBeenCalled()
  })

  it('persists the chosen size only on Save, then closes', async () => {
    const user = userEvent.setup()
    renderModal()
    fireEvent.change(slider(), { target: { value: '1.25' } })
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(saveFontScale).toHaveBeenCalledWith(1.25)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reverts the live preview to the saved size on cancel, without saving', async () => {
    const user = userEvent.setup()
    renderModal(true, settings({ fontScale: 1 }))
    fireEvent.change(slider(), { target: { value: '1.375' } })
    previewFontScale.mockClear()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(previewFontScale).toHaveBeenLastCalledWith(1)
    expect(saveFontScale).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('signs out from the dialog', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
  })
})
