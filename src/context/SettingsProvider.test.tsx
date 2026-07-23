import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { AuthContext } from './authContext'
import { useSettings } from './settingsContext'

// Mock the data layer so the provider never touches the real Firestore SDK.
const fetchSettings = vi.fn()
const saveSettings = vi.fn()
vi.mock('../firebase/settings', () => ({
  fetchSettings: (...args: unknown[]) => fetchSettings(...args),
  saveSettings: (...args: unknown[]) => saveSettings(...args),
}))
// The autosave path is fire-and-forget (no saveError alert anymore), so a
// rejection's ONLY observable outcome is the Sentry report — mock it to assert.
const reportError = vi.fn()
vi.mock('../observability/reportError', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}))

// Imported after the mock above is registered.
import { SettingsProvider } from './SettingsProvider'

const USER = { uid: 'owner-1' } as User

// Reads the applied values and offers a save trigger, so a test can observe the
// provider's state and the document side effects.
const Probe = () => {
  const {
    fontScale,
    theme,
    language,
    defaultDeliveryMethod,
    defaultPaymentMethod,
    defaultCurrency,
    saveSettings: save,
  } = useSettings()
  return (
    <>
      <button
        onClick={() =>
          save({
            fontScale: 1.25,
            theme: 'light',
            language: 'en',
            defaultDeliveryMethod: 'cdek',
            defaultPaymentMethod: 'card',
            defaultCurrency: 'EUR',
          })
        }
      >
        save
      </button>
      <span>scale:{fontScale}</span>
      <span>theme:{theme}</span>
      <span>lang:{language}</span>
      <span>delivery:{defaultDeliveryMethod}</span>
      <span>payment:{defaultPaymentMethod}</span>
      <span>currency:{defaultCurrency}</span>
    </>
  )
}

const tree = (user: User | null) => (
  <AuthContext.Provider value={{ user, loading: false, sessionLost: false }}>
    <SettingsProvider>
      <Probe />
    </SettingsProvider>
  </AuthContext.Provider>
)

const renderProvider = (user: User | null = USER) => render(tree(user))

const cssScale = () => document.documentElement.style.getPropertyValue('--font-scale')
const dataTheme = () => document.documentElement.getAttribute('data-theme')
const htmlLang = () => document.documentElement.getAttribute('lang')

beforeEach(() => {
  vi.clearAllMocks()
  fetchSettings.mockResolvedValue({})
  saveSettings.mockResolvedValue(undefined)
  document.documentElement.style.removeProperty('--font-scale')
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('lang')
  localStorage.clear()
})

describe('SettingsProvider', () => {
  it('loads the saved font scale and applies it to the document', async () => {
    fetchSettings.mockResolvedValue({ fontScale: 1.25 })
    renderProvider()
    await waitFor(() => expect(fetchSettings).toHaveBeenCalledWith('owner-1'))
    await screen.findByText('scale:1.25')
    // The document apply lives in a PASSIVE EFFECT, while findByText resolves on
    // the render COMMIT (its MutationObserver sees the probe text before the
    // effect flushes) — asserting the attribute synchronously here is a race,
    // and exactly the flake that kept tripping this suite (theme twice locally,
    // language once in CI). Every document-side-effect assert below therefore
    // waits for the effect instead of racing it.
    await waitFor(() => expect(cssScale()).toBe('1.25'))
  })

  it('loads the saved theme and applies it to the document + cache', async () => {
    fetchSettings.mockResolvedValue({ theme: 'light' })
    renderProvider()
    await screen.findByText('theme:light')
    await waitFor(() => expect(dataTheme()).toBe('light'))
    expect(localStorage.getItem('bloomy-theme')).toBe('light')
  })

  it('defaults to the dark theme when none is saved', async () => {
    renderProvider()
    await screen.findByText('theme:dark')
    await waitFor(() => expect(dataTheme()).toBe('dark'))
  })

  it('loads the saved language and applies it to <html lang> + cache', async () => {
    fetchSettings.mockResolvedValue({ language: 'en' })
    renderProvider()
    await screen.findByText('lang:en')
    await waitFor(() => expect(htmlLang()).toBe('en'))
    expect(localStorage.getItem('bloomy-lang')).toBe('en')
  })

  it('defaults to Russian when no language is saved', async () => {
    renderProvider()
    await screen.findByText('lang:ru')
    // `lang:ru` is also the loading-state default, so it renders before settings
    // resolve; the <html lang> apply runs once they do — wait for that side effect
    // rather than racing it.
    await waitFor(() => expect(htmlLang()).toBe('ru'))
  })

  it('keeps the cached language while settings load (no default clobber / flash)', async () => {
    // A signed-in user with English saved: the cache + first paint are already en.
    localStorage.setItem('bloomy-lang', 'en')
    // Never resolves → the provider stays in the loading window.
    fetchSettings.mockReturnValue(new Promise<never>(() => {}))
    renderProvider()
    // Context surfaces the fallback default while loading, but the mount effect
    // must NOT apply it: doing so would flip i18next to ru and stomp the cache,
    // then flip back to en once Firestore resolves (the en→ru→en flash).
    await screen.findByText('lang:ru')
    expect(localStorage.getItem('bloomy-lang')).toBe('en')
  })

  it('loads the saved order defaults (delivery + payment)', async () => {
    fetchSettings.mockResolvedValue({ defaultDeliveryMethod: 'taxi', defaultPaymentMethod: 'bank' })
    renderProvider()
    await screen.findByText('delivery:taxi')
    await screen.findByText('payment:bank')
  })

  it('defaults the order methods to post/card when none are saved', async () => {
    renderProvider()
    await screen.findByText('delivery:post')
    await screen.findByText('payment:card')
  })

  it('loads the saved default currency', async () => {
    fetchSettings.mockResolvedValue({ defaultCurrency: 'USD' })
    renderProvider()
    await screen.findByText('currency:USD')
  })

  it('defaults the currency to RUB when none is saved', async () => {
    renderProvider()
    await screen.findByText('currency:RUB')
  })

  it('persists and applies new values on save', async () => {
    const user = userEvent.setup()
    renderProvider()
    await screen.findByText('scale:1')
    await user.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() =>
      expect(saveSettings).toHaveBeenCalledWith('owner-1', {
        fontScale: 1.25,
        theme: 'light',
        language: 'en',
        defaultDeliveryMethod: 'cdek',
        defaultPaymentMethod: 'card',
        defaultCurrency: 'EUR',
      }),
    )
    await screen.findByText('scale:1.25')
    await screen.findByText('theme:light')
    await screen.findByText('lang:en')
    await screen.findByText('delivery:cdek')
    await screen.findByText('payment:card')
    await screen.findByText('currency:EUR')
    await waitFor(() => {
      expect(cssScale()).toBe('1.25')
      expect(dataTheme()).toBe('light')
      expect(htmlLang()).toBe('en')
    })
  })

  it('routes a rejected background save to Sentry, keeping the applied values', async () => {
    // The fire-and-forget autosave has no visible error path by design (the
    // optimistic values stay applied; offline just queues). A GENUINE rejection
    // (online permission-denied) must therefore reach Sentry — otherwise a
    // permanently failing save would be invisible everywhere.
    const user = userEvent.setup()
    saveSettings.mockRejectedValue(new Error('permission-denied'))
    renderProvider()
    await screen.findByText('scale:1')

    await user.click(screen.getByRole('button', { name: 'save' }))

    await waitFor(() =>
      expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'saveSettings'),
    )
    // The optimistic commit is not rolled back — the UI keeps what was applied.
    await screen.findByText('scale:1.25')
  })

  it('falls back to the defaults when signed out and never fetches', async () => {
    renderProvider(null)
    await screen.findByText('scale:1')
    await screen.findByText('theme:dark')
    expect(fetchSettings).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(cssScale()).toBe('1')
      expect(dataTheme()).toBe('dark')
    })
  })

  it('hands consumers the same context value across an unrelated re-render (memoised)', async () => {
    // The provider wraps the whole app; a fresh value object every render would
    // re-render every useSettings consumer regardless of the slice they read.
    // Capture the context object on each render and verify the reference doesn't
    // change when a consumer re-renders for an unrelated reason (e.g., parent
    // state change that doesn't affect settings).
    fetchSettings.mockResolvedValue({ fontScale: 1.25 })
    const seen: ReturnType<typeof useSettings>[] = []
    const Capture = () => {
      const ctx = useSettings()
      seen.push(ctx)
      return <span>scale:{ctx.fontScale}</span>
    }
    const Harness = ({ counter }: { counter: number }) => (
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <SettingsProvider>
          <span>counter:{counter}</span>
          <Capture />
        </SettingsProvider>
      </AuthContext.Provider>
    )
    const { rerender } = render(<Harness counter={0} />)
    await screen.findByText('scale:1.25')
    await waitFor(() => expect(fetchSettings).toHaveBeenCalledWith('owner-1'))

    const stableRef = seen[seen.length - 1]
    rerender(<Harness counter={1} />)
    // Even though Harness re-rendered and Capture ran again, the memoised value
    // object should be the SAME reference because settings didn't change.
    expect(seen[seen.length - 1]).toBe(stableRef)
  })

  it('resets state and the document to defaults on sign-out so the next user gets no stale value', async () => {
    fetchSettings.mockResolvedValue({ fontScale: 1.25, theme: 'light' })
    const { rerender } = renderProvider()
    await screen.findByText('scale:1.25')
    await screen.findByText('theme:light')

    rerender(tree(null))
    await screen.findByText('scale:1')
    await screen.findByText('theme:dark')
    expect(cssScale()).toBe('1')
    expect(dataTheme()).toBe('dark')
  })
})
