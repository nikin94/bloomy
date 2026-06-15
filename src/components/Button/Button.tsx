import type { ButtonHTMLAttributes } from 'react'

// Shared button. The app has two visual kinds repeated across the header, the
// login screen and the order form — a filled brand button and an outlined one —
// so they live here behind a `variant` union (not a boolean: variants are
// mutually exclusive and the set may grow). `size` covers the padding/scale
// differences, including icon-only buttons. Every native <button> attribute
// (onClick, disabled, aria-label, …) passes straight through, and a caller's
// `className` is merged last so per-use tweaks (self-start, shrink-0) still win.
type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'md' | 'sm' | 'icon'

// Shared across every variant: shape, focus ring and disabled treatment.
const baseClass =
  'inline-flex items-center justify-center rounded-md font-medium ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white transition-opacity hover:opacity-90',
  secondary:
    'border border-border text-heading transition-colors hover:bg-primary-bg disabled:hover:bg-transparent',
}

const sizeClass: Record<ButtonSize, string> = {
  md: 'px-5 py-2',
  sm: 'px-3 py-2 text-sm',
  icon: 'p-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

// `type` defaults to "button" so a button never submits a form by accident;
// pass type="submit" explicitly for the one that does.
const Button = ({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) => (
  <button
    type={type}
    className={`${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    {...props}
  />
)

export default Button
