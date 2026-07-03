import type { ThemeMode } from '../../types/settings'
import SunIcon from '../icons/SunIcon'
import MoonIcon from '../icons/MoonIcon'

// Theme switch styled as a pill track with a sun (light) and a moon (dark) at
// its ends; the sliding knob carries the ACTIVE theme's icon, so the visible
// track icon is the other option. A real `role="switch"` (checked = dark) so it
// is keyboard- and screen-reader-operable.
const ThemeToggle = ({
  value,
  label,
  onChange,
}: {
  value: ThemeMode
  label: string
  onChange: (next: ThemeMode) => void
}) => {
  const isDark = value === 'dark'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      onClick={() => onChange(isDark ? 'light' : 'dark')}
      className="relative inline-flex h-9 w-[4.5rem] shrink-0 items-center rounded-full border border-border bg-primary-bg p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {/* Track icons at each end (the not-selected option stays visible). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-text"
      >
        <SunIcon />
        <MoonIcon />
      </span>
      {/* Sliding knob carrying the active theme's icon. */}
      <span
        className={`relative z-10 flex size-7 items-center justify-center rounded-full bg-bg text-primary shadow transition-transform ${
          isDark ? 'translate-x-[2.25rem]' : 'translate-x-0'
        }`}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  )
}

export default ThemeToggle
