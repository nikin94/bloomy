// A spinning ring loader, drawn from the current text colour so it reads on any
// background it's placed on: inside a primary Button it's white, inside a danger
// Button it's red, on the page it's the brand colour — set via `text-*` on the
// element or an ancestor. The track is transparent and only the TOP edge is
// coloured (currentColor), so the spinning arc is clearly visible — Tailwind v4
// drops the opacity modifier on the `current` keyword, so a faint full ring isn't
// available without hardcoding a colour, and an arc reads better anyway. No extra
// library — the same Tailwind `animate-spin` the full-page spinner used.
//
// `size` covers the three places it's needed: `sm` inside buttons (replacing the
// "Saving…" text), `lg` as the full-page overlay (see Spinner). Carries the
// `status` role + a translated label so a button in its loading state announces it.
import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

type LoaderSize = 'sm' | 'md' | 'lg'

const sizeClass: Record<LoaderSize, string> = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-16 border-4',
}

const Loader = ({ size = 'md', className = '' }: { size?: LoaderSize; className?: string }) => {
  const { t } = useTranslation()
  const ref = useRef<HTMLSpanElement>(null)
  // Phase-sync to the page clock: `animate-spin` is a 1s loop that starts at 0°
  // on MOUNT, so when one loading source hands off to another (the route
  // Suspense fallback → a form's own spinner, the auth gate → the route
  // fallback) the freshly mounted ring visibly snaps back and reads as a SECOND
  // loader starting over. A negative delay of (now mod 1s) starts every
  // instance mid-cycle exactly where an uninterrupted ring would be, so
  // consecutive spinners look like one continuous loader. A LAYOUT effect (not
  // render — performance.now is impure there, and not a passive effect — that
  // would paint one 0° frame first) sets it before the browser paints.
  useLayoutEffect(() => {
    ref.current?.style.setProperty('animation-delay', `-${performance.now() % 1000}ms`)
  }, [])
  return (
    <span
      ref={ref}
      role="status"
      aria-label={t('loading')}
      className={`inline-block shrink-0 animate-spin rounded-full border-transparent border-t-current ${sizeClass[size]} ${className}`}
    />
  )
}

export default Loader
