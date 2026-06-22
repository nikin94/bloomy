import type { ButtonHTMLAttributes } from 'react'
import Loader from '../Loader/Loader'

// Shared button. The app has three visual kinds — a filled brand button, an
// outlined neutral one, and a tinted `danger` for destructive actions — so they
// live here behind a `variant` union (not a boolean: variants are mutually
// exclusive and the set may grow). `danger` is outlined (border + text + a
// low-alpha hover fill) rather than solid-white-on-red: in dark mode no red can
// clear AA for white text while also reading on the dark bg, so the tinted style
// keeps it accessible in both themes. `size` covers the padding/scale
// differences, including icon-only buttons. Every native <button> attribute
// (onClick, disabled, aria-label, …) passes straight through, and a caller's
// `className` is merged last so per-use tweaks (self-start, shrink-0) still win.
type ButtonVariant = 'primary' | 'secondary' | 'danger'
type ButtonSize = 'md' | 'sm' | 'icon'

// Shared across every variant: shape, focus ring and disabled treatment.
const baseClass =
  'inline-flex items-center justify-center rounded-md font-medium ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:cursor-default disabled:opacity-50'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white transition-opacity hover:opacity-90',
  secondary:
    'border border-border text-heading transition-colors hover:bg-primary-bg disabled:hover:bg-transparent',
  danger:
    'border border-danger text-danger transition-colors hover:bg-danger-bg disabled:hover:bg-transparent',
}

const sizeClass: Record<ButtonSize, string> = {
  md: 'px-5 py-2',
  sm: 'px-3 py-2 text-sm',
  icon: 'p-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  // When true the button shows a Loader IN PLACE of its children and disables
  // itself, so a busy caller passes `isLoading={saving}` plain children instead
  // of hand-rolling the `saving ? <Loader/> : 'Сохранить'` ternary and a
  // matching `disabled`. The Loader draws from currentColor, so it stays legible
  // on every variant (white on primary, danger-red on danger).
  isLoading?: boolean
}

// `type` defaults to "button" so a button never submits a form by accident;
// pass type="submit" explicitly for the one that does.
const Button = ({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) => (
  <button
    type={type}
    // A loading button is non-interactive, on top of any caller-set disabled.
    disabled={disabled || isLoading}
    className={`${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    {...props}
  >
    {isLoading ? <Loader size="sm" /> : children}
  </button>
)

export default Button
