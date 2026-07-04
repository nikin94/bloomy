// A dual-thumb range slider, built from two overlaid native `<input type="range">`
// elements — replacing the react-range-slider-input dependency (~19 kB gzip) with
// platform controls. Native inputs give real keyboard support (arrows/Home/End),
// touch, and screen-reader semantics for free; each input is a `role="slider"`
// with its own aria-label.
//
// The two inputs stack over one shared track. Only their THUMBS capture pointer
// events (see the .range-input rules in index.css: the input body is
// pointer-events:none, the thumb pseudo-element re-enables them) so the top input
// doesn't swallow drags meant for the other's thumb. The coloured fill and the
// base track are drawn here as plain divs behind the inputs.
//
// The thumbs are kept ordered (never crossing): the lower thumb is clamped at or
// below the upper and vice-versa, matching the old library's behaviour, so the
// caller always gets a well-ordered [lo, hi] pair.
import type { PointerEvent } from 'react'

interface RangeSliderProps {
  min: number
  max: number
  step: number
  // Current [lower, upper] thumb positions. Controlled — the caller owns state.
  value: [number, number]
  // Fires with the new ordered [lower, upper] pair on any thumb move.
  onInput: (value: [number, number]) => void
  // Accessible names for the [lower, upper] thumbs (each input is a slider).
  ariaLabel: [string, string]
  // Formats the value a screen reader announces (aria-valuetext). A native range
  // slider otherwise reads out the raw number — meaningless here, where the value
  // is an amount in minor units (e.g. "150000"). Pass a money formatter so it
  // announces "1 500,00 ₽" instead. Omit to fall back to the numeric aria-valuenow.
  formatValue?: (value: number) => string
}

const RangeSlider = ({ min, max, step, value, onInput, ariaLabel, formatValue }: RangeSliderProps) => {
  const [lo, hi] = value
  // Percent positions of each thumb along the track, for the fill overlay. Guard
  // a zero span (min === max) so we never divide by zero.
  const span = max - min || 1
  const loPct = ((lo - min) / span) * 100
  const hiPct = ((hi - min) / span) * 100

  // Clamp so the thumbs never cross: the lower can't pass the upper, and the
  // upper can't drop below the lower.
  const setLo = (next: number) => onInput([Math.min(next, hi), hi])
  const setHi = (next: number) => onInput([lo, Math.max(next, lo)])

  // Track-click-to-jump: a press on the bare track moves the NEARER thumb to that
  // point, so a coarse position is one tap instead of a long drag. A press on a
  // thumb targets its <input> (the only pointer-capturing part) — left untouched
  // here so the native drag still owns it. Reuses the setLo/setHi ordering clamps.
  const jumpToPoint = (e: PointerEvent<HTMLDivElement>) => {
    // Filter by input-target, NOT `currentTarget === target`: the base-track and
    // fill overlays are child <div>s of the visual track, and a press on them
    // should still count as a track press. Only the <input> thumbs are skipped.
    if (e.target instanceof HTMLInputElement) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    // Assumes LTR: the pixel offset is `clientX - rect.left`. An RTL language
    // would need `rect.right - clientX` (or an explicit `dir` gate); both UI
    // locales are LTR today, so this is safe until one is added.
    const raw = min + ((e.clientX - rect.left) / rect.width) * (max - min)
    // Snap to the inputs' own step and clamp into range.
    const snapped = Math.min(max, Math.max(min, Math.round(raw / step) * step))
    // Ties (equidistant) go to the lower thumb.
    if (Math.abs(snapped - lo) <= Math.abs(snapped - hi)) setLo(snapped)
    else setHi(snapped)
  }

  return (
    <div className="relative h-5" onPointerDown={jumpToPoint}>
      {/* Base track. */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
      {/* Selected range fill between the two thumbs. */}
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
        style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
      />
      {/* Two overlaid inputs. When the thumbs bunch in the upper half the lower
          input is raised so it stays grabbable (you can pull it back left);
          otherwise the upper input stays on top for the same reason on the left. */}
      <input
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={lo}
        aria-label={ariaLabel[0]}
        aria-valuetext={formatValue ? formatValue(lo) : undefined}
        onChange={(e) => setLo(Number(e.target.value))}
        style={{ zIndex: loPct > 50 ? 4 : 3 }}
      />
      <input
        type="range"
        className="range-input"
        min={min}
        max={max}
        step={step}
        value={hi}
        aria-label={ariaLabel[1]}
        aria-valuetext={formatValue ? formatValue(hi) : undefined}
        onChange={(e) => setHi(Number(e.target.value))}
        style={{ zIndex: 3 }}
      />
    </div>
  )
}

export default RangeSlider
