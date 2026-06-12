import { NavLink } from 'react-router-dom'

// App-wide navigation header. The buttons are NavLinks (they change the URL),
// styled to look like buttons — links are the a11y-correct element for
// navigation, and NavLink gives us the active-route state for free.
const navButtonClass = ({ isActive }: { isActive: boolean }) =>
  [
    'inline-flex items-center rounded-md px-4 py-2 text-sm font-medium no-underline transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    isActive ? 'bg-accent text-white' : 'border border-border text-heading hover:bg-accent-bg',
  ].join(' ')

function AppHeader() {
  return (
    <header className="flex items-center gap-2 border-b border-border px-6 py-4">
      {/* `end` so "Заказы" is only active on the exact list route, not on /orders/new */}
      <NavLink to="/orders" end className={navButtonClass}>
        Заказы
      </NavLink>
      <NavLink to="/orders/new" className={navButtonClass}>
        Новый заказ
      </NavLink>
    </header>
  )
}

export default AppHeader
