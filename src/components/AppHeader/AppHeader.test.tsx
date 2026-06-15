import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '../../context/authContext'

// Stub the auth module so the sign-out button never touches the real Firebase SDK.
const signOutUser = vi.fn()
vi.mock('../../firebase/auth', () => ({ signOutUser: (...args: unknown[]) => signOutUser(...args) }))

// Imported after the mock above is registered.
import AppHeader from './AppHeader'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

const renderHeader = () =>
  render(
    <AuthContext.Provider value={{ user: USER, loading: false }}>
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

describe('AppHeader', () => {
  it('keeps the sign-out control accessible by name even though it is icon-only', () => {
    signOutUser.mockResolvedValue(undefined)
    renderHeader()
    // The button shows only an icon now; the accessible name must survive via aria-label.
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('signs out when the logout icon is clicked', async () => {
    signOutUser.mockResolvedValue(undefined)
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(signOutUser).toHaveBeenCalledTimes(1)
  })
})
