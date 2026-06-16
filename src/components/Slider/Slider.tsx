// Custom-styled range input shared across the app (the settings font-size
// control and the orders price filter). The native `accent-color` thumb can't
// be resized, so we strip the appearance and draw our own: an enlarged thumb
// (size-6) for an easy grab, ringed with the background so it reads as a knob,
// `-mt-2.5` re-centring the 24px thumb on the 4px track. Stays a real
// <input type="range">, so its slider role and keyboard control are unchanged.
const sliderClass =
  // `block` removes the inline-block descender gap below the input, so the
  // wrapper's height matches the track and any step ticks centre on it exactly.
  'relative block h-6 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border ' +
  '[&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:-mt-2.5 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  // Accessible name; the control shows no visible label of its own.
  ariaLabel: string
  // Human-readable value for screen readers (e.g. "увеличен") in place of the
  // raw number. Omit to let the browser announce the number.
  ariaValueText?: string
  // Number of evenly-spaced notch marks drawn under the track (iOS-style), so a
  // discrete slider shows its snap points. Omit for a plain continuous track.
  ticks?: number
  onChange: (value: number) => void
  // Wrapper sizing (e.g. flex-1), merged onto the positioned container.
  className?: string
}

const Slider = ({
  value,
  min,
  max,
  step,
  ariaLabel,
  ariaValueText,
  ticks,
  onChange,
  className = '',
}: SliderProps) => (
  <div className={`relative ${className}`}>
    {ticks ? (
      // Step notches. Inset by the thumb radius (px-3) so each tick lines up with
      // the thumb's centre at its snap point; the thumb (z-10) rides over them.
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 top-1/2 flex h-3 -translate-y-1/2 items-center justify-between"
      >
        {Array.from({ length: ticks }).map((_, i) => (
          <span key={i} className="h-3 w-0.5 rounded-full bg-border" />
        ))}
      </div>
    ) : null}
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      className={sliderClass}
    />
  </div>
)

export default Slider
