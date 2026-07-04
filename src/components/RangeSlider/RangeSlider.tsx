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
}

const RangeSlider = ({ min, max, step, value, onInput, ariaLabel }: RangeSliderProps) => {
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

  return (
    <div className="relative h-5">
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
        onChange={(e) => setHi(Number(e.target.value))}
        style={{ zIndex: 3 }}
      />
    </div>
  )
}

export default RangeSlider
