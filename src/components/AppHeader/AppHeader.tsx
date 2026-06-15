import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/auth-context'
import { signOutUser } from '../../lib/auth'

// App-wide navigation header. The buttons are NavLinks (they change the URL),
// styled to look like buttons — links are the a11y-correct element for
// navigation, and NavLink gives us the active-route state for free.
const navButtonClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex items-center rounded-md px-4 py-2 text-sm font-medium no-underline transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive ? 'bg-primary text-white' : 'border border-border text-heading hover:bg-primary-bg',
  ].join(' ')

function AppHeader() {
  const { user } = useAuth()

  return (
    <header className="flex items-center gap-2 border-b border-border px-6 py-4">
      {/* `end` so "Заказы" is only active on the exact list route, not on /orders/new */}
      <NavLink to="/orders" end className={navButtonClass}>
        Заказы
      </NavLink>
      <NavLink to="/orders/new" className={navButtonClass}>
        Новый заказ
      </NavLink>

      {/* Account block pushed to the right; sign-out flips the session and the
          route guard sends the user back to the login screen. */}
      <div className="ml-auto flex items-center gap-3">
        {user && (
          <span className="hidden text-sm text-text sm:inline">
            {user.displayName ?? user.email}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            // signOut is a local operation (clears persisted session, no network
            // request), so failure is unlikely — but don't swallow it silently.
            signOutUser().catch((err: unknown) => console.error('Sign-out failed', err))
          }}
          className="rounded-md border border-border px-3 py-2 text-sm text-heading transition-colors hover:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Выйти
        </button>
      </div>
    </header>
  )
}

export default AppHeader
