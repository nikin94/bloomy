import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/authContext'
import { signOutUser } from '../../firebase/auth'
import Button from '../Button/Button'

// App-wide navigation header. The buttons are NavLinks (they change the URL),
// styled to look like buttons — links are the a11y-correct element for
// navigation, and NavLink gives us the active-route state for free.
//
// Two visual kinds: the nav group (Заказы, Клиенты) are destinations — outline
// buttons whose active route is filled. "Новый заказ" is an ACTION (it creates),
// so it gets the primary treatment and sits apart, behind a divider, instead of
// reading as a third tab. It is still a NavLink (it navigates to the form route)
// — links stay the a11y-correct element for navigation, so it can't be a
// <Button> — but it mirrors the primary Button's look so the create action is
// unmistakably the main action.
const navButtonClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex items-center rounded-md px-4 py-2 text-sm font-medium no-underline transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    isActive ? 'bg-primary text-white' : 'border border-border text-heading hover:bg-primary-bg',
  ].join(' ')

const actionButtonClass =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium ' +
  'text-white no-underline transition-opacity hover:opacity-90 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const AppHeader = () => {
  const { user } = useAuth()

  return (
    <header className="flex items-center gap-2 border-b border-border px-6 py-4">
      {/* Navigation group — destinations. `end` so "Заказы" is only active on
          the exact list route, not on /orders/new. */}
      <NavLink to="/orders" end className={navButtonClass}>
        Заказы
      </NavLink>
      <NavLink to="/customers" className={navButtonClass}>
        Клиенты
      </NavLink>

      {/* Divider so the create action below reads as a different kind of
          control, not a third navigation tab. */}
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />

      {/* Primary action: create an order. */}
      <NavLink to="/orders/new" className={actionButtonClass}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
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
        {/* Icon-only sign-out. `aria-label` + `title` keep the accessible name
            (and a hover tooltip) now that the "Выйти" text is gone. */}
        <Button
          variant="secondary"
          size="icon"
          onClick={() => {
            // signOut is a local operation (clears persisted session, no network
            // request), so failure is unlikely — but don't swallow it silently.
            signOutUser().catch((err: unknown) => console.error('Sign-out failed', err))
          }}
          aria-label="Выйти"
          title="Выйти"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </Button>
      </div>
    </header>
  )
}

export default AppHeader
