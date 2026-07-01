import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '../../types/settings'
import type { ThemeMode } from '../../types/settings'

// Presentational building blocks of the settings dialog, extracted from
// SettingsModal so the dialog body reads as a short composition of named
// controls rather than one long render. None hold settings state — they take
// the current value and a change callback; the dialog owns the drafts.

// A plain vertical list of settings rows separated by hairline dividers — NOT a
// bordered card. Dropping the card border + rounding (and the rows' own
// horizontal padding, see Row) lets each control span the dialog's full content
// width: the Modal panel already pads the edges, so a boxed card here only
// stacked a second inset that squeezed the usable width on a phone. The
// between-row hairline keeps the settings scannable (same divider language as
// DetailRow) without walling them off.
export const Group = ({ children }: { children: ReactNode }) => (
  <div className="[&>*+*]:border-t [&>*+*]:border-border">{children}</div>
)

// One settings row: label on the left, control on the right. The label stays on
// one line (shrink-0 + nowrap) so a wide control can't squeeze it into a wrap.
// No horizontal padding — the row runs edge to edge inside the Group (the Modal
// panel already insets it), so the control gets the full width; only vertical
// padding sets the row rhythm.
export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div
    // ≤768px: stack label over control (two lines) so a fixed-width control can't
    // push the row wider than a phone viewport. ≥769px: the original label-left /
    // control-right row.
    className="flex flex-col items-start gap-1.5 py-3 min-[769px]:flex-row min-[769px]:items-center min-[769px]:justify-between min-[769px]:gap-3"
  >
    <span className="text-sm font-medium text-heading min-[769px]:shrink-0 min-[769px]:whitespace-nowrap">
      {label}
    </span>
    {children}
  </div>
)

const SunIcon = () => (
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
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)

const MoonIcon = () => (
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
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

export const LogoutIcon = () => (
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
)

// Theme switch styled as a pill track with a sun (light) and a moon (dark) at
// its ends; the sliding knob carries the ACTIVE theme's icon, so the visible
// track icon is the other option. A real `role="switch"` (checked = dark) so it
// is keyboard- and screen-reader-operable.
export const ThemeToggle = ({
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

// Number of discrete positions on the slider (one notch each), so the iOS-style
// ticks below the track always match the actual snap points.
const SCALE_STEPS = Math.round((FONT_SCALE_MAX - FONT_SCALE_MIN) / FONT_SCALE_STEP) + 1

// Custom-styled range: the native `accent-color` thumb can't be resized, so we
// strip the appearance and draw our own. The thumb is enlarged (size-6) for an
// easy grab and ringed with the background so it reads as a knob riding over the
// step ticks; `-mt-2.5` re-centres the 24px thumb on the 4px track. Stays a real
// <input type="range">, so its slider role / keyboard control are unchanged.
const sliderClass =
  // `block` removes the inline-block descender gap below the input, so the
  // wrapper's height matches the track and the step ticks centre on it exactly.
  'relative block h-6 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border ' +
  '[&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:-mt-2.5 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow'

// Translation key (under settings:fontScale) describing the current scale for
// screen readers, so the slider announces "уменьшен"/"по умолчанию"/"увеличен"
// (localised) rather than a raw number.
const fontScaleLabelKey = (scale: number): 'decreased' | 'default' | 'increased' => {
  if (scale < 1) return 'decreased'
  if (scale > 1) return 'increased'
  return 'default'
}

// The font-size row: a label and an iOS-style notched size slider flanked by a
// small and a large "А". Owns the pointer-drag handling — while the thumb is
// held down it updates only the draft (thumb, ticks, aria) and HOLDS the live
// font preview, applying it once on release, so the rescaling page doesn't slide
// the thumb out from under the held pointer. Keyboard arrows (no pointer down)
// preview each discrete step live. `onDraftChange` updates the draft; `onPreview`
// applies the live page font scale.
export const FontSizeSlider = ({
  value,
  onDraftChange,
  onPreview,
}: {
  value: number
  onDraftChange: (next: number) => void
  onPreview: (next: number) => void
}) => {
  const { t } = useTranslation('settings')
  const draggingRef = useRef(false)

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value)
    onDraftChange(next)
    if (!draggingRef.current) onPreview(next)
  }
  const handlePointerDown = () => {
    draggingRef.current = true
  }
  // Drag ended (pointer up, or capture lost when released off-element): apply the
  // final scale in one reflow. Read the value off the DOM so we don't depend on
  // the just-set draft state having flushed.
  const handleDragEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    onPreview(Number(e.currentTarget.value))
  }

  return (
    <div className="flex flex-col items-start gap-2 py-3 min-[769px]:flex-row min-[769px]:items-center min-[769px]:gap-4">
      <span className="text-sm font-medium text-heading min-[769px]:min-w-0 min-[769px]:flex-1">
        {t('fontSize')}
      </span>
      {/* ≤768px the slider cluster takes the full second line (easier to drag);
          ≥769px it keeps the fixed width that lines up with the other rows. */}
      <div className="flex w-full items-center gap-3 min-[769px]:w-36 min-[769px]:shrink-0">
        <span aria-hidden="true" className="shrink-0 text-sm text-text">
          А
        </span>
        <div className="relative flex-1">
          {/* Step notches, iOS-style. Inset by the thumb radius (px-3) so the
              ticks line up with the thumb's centre at each snap point; taller
              than the track so their ends show past it. The thumb (z-10) sits
              over the current notch. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 top-1/2 flex h-3 -translate-y-1/2 items-center justify-between"
          >
            {Array.from({ length: SCALE_STEPS }).map((_, i) => (
              <span key={i} className="h-3 w-0.5 rounded-full bg-border" />
            ))}
          </div>
          <input
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={value}
            onChange={handleSlider}
            onPointerDown={handlePointerDown}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            onLostPointerCapture={handleDragEnd}
            aria-label={t('fontSize')}
            // Screen readers announce a human-readable label (e.g. "увеличен")
            // instead of the raw scale number (0.875, 1.25).
            aria-valuetext={t(`fontScale.${fontScaleLabelKey(value)}` as const)}
            className={sliderClass}
          />
        </div>
        <span aria-hidden="true" className="shrink-0 text-2xl text-text">
          А
        </span>
      </div>
    </div>
  )
}
