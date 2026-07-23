import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '@/types/settings'

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
// screen readers, so the slider announces "decreased"/"default"/"increased"
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
const FontSizeSlider = ({
  value,
  onDraftChange,
  onPreview,
  onDraggingChange,
}: {
  value: number
  onDraftChange: (next: number) => void
  onPreview: (next: number) => void
  // Mirrors the internal draggingRef up to the caller, so the page can hold
  // off re-syncing the draft from a saved value that changes MID-drag (the
  // first-session case: Firestore settings resolve while the thumb is held —
  // without the guard the sync would yank the thumb out from under the pointer).
  onDraggingChange?: (dragging: boolean) => void
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
    onDraggingChange?.(true)
  }
  // Drag ended (pointer up, or capture lost when released off-element): apply the
  // final scale in one reflow. Read the value off the DOM so we don't depend on
  // the just-set draft state having flushed.
  const handleDragEnd = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    onDraggingChange?.(false)
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
            // Screen readers announce a human-readable label (e.g. "increased")
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

export default FontSizeSlider
