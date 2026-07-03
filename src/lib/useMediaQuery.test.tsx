import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

// A controllable matchMedia stub: one active MediaQueryList whose `matches` we
// flip and whose `change` listeners we fire, to prove the hook re-renders on a
// breakpoint change (not just on mount).
let currentMatches = false
const listeners = new Set<() => void>()
const originalMatchMedia = window.matchMedia

const setMatches = (next: boolean) => {
  currentMatches = next
  act(() => listeners.forEach((l) => l()))
}

window.matchMedia = ((query: string) =>
  ({
    matches: currentMatches,
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }) as unknown as MediaQueryList) as typeof window.matchMedia

afterEach(() => {
  listeners.clear()
  currentMatches = false
})

// Restore the shared desktop stub after this suite so later suites aren't
// affected (must NOT run at import time, which would undo the stub above).
afterAll(() => {
  window.matchMedia = originalMatchMedia
})

const Probe = () => <span>{useMediaQuery('(min-width: 768px)') ? 'wide' : 'narrow'}</span>

describe('useMediaQuery', () => {
  it('reads the initial match and re-renders when the query flips', () => {
    render(<Probe />)
    expect(screen.getByText('narrow')).toBeInTheDocument()

    setMatches(true)
    expect(screen.getByText('wide')).toBeInTheDocument()

    setMatches(false)
    expect(screen.getByText('narrow')).toBeInTheDocument()
  })

  it('unsubscribes on unmount (no leaked listener)', () => {
    const { unmount } = render(<Probe />)
    expect(listeners.size).toBe(1)
    unmount()
    expect(listeners.size).toBe(0)
  })
})
