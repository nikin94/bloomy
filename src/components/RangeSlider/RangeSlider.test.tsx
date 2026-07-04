import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RangeSlider from './RangeSlider'

// Helper: render with sensible defaults, overridable per test.
const setup = (over: Partial<Parameters<typeof RangeSlider>[0]> = {}) => {
  const onInput = vi.fn()
  render(
    <RangeSlider
      min={0}
      max={100}
      step={1}
      value={[20, 80]}
      onInput={onInput}
      ariaLabel={['Минимум', 'Максимум']}
      {...over}
    />,
  )
  return {
    onInput,
    lower: screen.getByRole('slider', { name: 'Минимум' }) as HTMLInputElement,
    upper: screen.getByRole('slider', { name: 'Максимум' }) as HTMLInputElement,
  }
}

describe('RangeSlider', () => {
  it('renders two labelled sliders reflecting the value pair', () => {
    const { lower, upper } = setup()
    expect(lower).toHaveValue('20')
    expect(upper).toHaveValue('80')
  })

  it('reports the new pair when the lower thumb moves', () => {
    const { onInput, lower } = setup()
    fireEvent.change(lower, { target: { value: '35' } })
    expect(onInput).toHaveBeenCalledWith([35, 80])
  })

  it('reports the new pair when the upper thumb moves', () => {
    const { onInput, upper } = setup()
    fireEvent.change(upper, { target: { value: '60' } })
    expect(onInput).toHaveBeenCalledWith([20, 60])
  })

  it('clamps the lower thumb so it never passes the upper', () => {
    const { onInput, lower } = setup({ value: [20, 50] })
    // Dragging the lower past the upper pins it AT the upper, never beyond.
    fireEvent.change(lower, { target: { value: '90' } })
    expect(onInput).toHaveBeenCalledWith([50, 50])
  })

  it('clamps the upper thumb so it never drops below the lower', () => {
    const { onInput, upper } = setup({ value: [40, 80] })
    fireEvent.change(upper, { target: { value: '10' } })
    expect(onInput).toHaveBeenCalledWith([40, 40])
  })

  it('forwards min/max/step to both inputs', () => {
    const { lower, upper } = setup({ min: 0, max: 500, step: 5 })
    for (const el of [lower, upper]) {
      expect(el).toHaveAttribute('min', '0')
      expect(el).toHaveAttribute('max', '500')
      expect(el).toHaveAttribute('step', '5')
    }
  })

  it('announces a formatted aria-valuetext on both thumbs when a formatter is given', () => {
    const { lower, upper } = setup({
      value: [20, 80],
      formatValue: (n) => `${n} ₽`,
    })
    // Screen readers read aria-valuetext in place of the raw aria-valuenow number.
    expect(lower).toHaveAttribute('aria-valuetext', '20 ₽')
    expect(upper).toHaveAttribute('aria-valuetext', '80 ₽')
  })

  it('omits aria-valuetext when no formatter is given (native numeric fallback)', () => {
    const { lower, upper } = setup()
    expect(lower).not.toHaveAttribute('aria-valuetext')
    expect(upper).not.toHaveAttribute('aria-valuetext')
  })

  it('does not divide by zero when min === max (a degenerate range)', () => {
    // The caller hides the slider when there is no range, but guard anyway so a
    // zero span can never produce NaN positions.
    expect(() => setup({ min: 10, max: 10, value: [10, 10] })).not.toThrow()
  })

  // The two inputs share one container; jsdom returns a zero rect, so stub the
  // container's geometry (0…100px maps 1:1 onto the 0…100 value range) to drive
  // the track-click math deterministically.
  const stubTrackWidth = (el: HTMLElement) => {
    el.getBoundingClientRect = () =>
      ({ left: 0, width: 100, right: 100, top: 0, bottom: 20, height: 20, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  }

  it('jumps the nearer thumb to a click on the bare track', () => {
    const { onInput, lower } = setup({ value: [20, 80] })
    const track = lower.parentElement as HTMLElement
    stubTrackWidth(track)
    // x=30 → value 30: closer to the lower (20) than the upper (80), so it moves.
    fireEvent.pointerDown(track, { clientX: 30 })
    expect(onInput).toHaveBeenCalledWith([30, 80])
  })

  it('moves the upper thumb when the track click is nearer to it', () => {
    const { onInput, lower } = setup({ value: [20, 80] })
    const track = lower.parentElement as HTMLElement
    stubTrackWidth(track)
    // x=70 → value 70: closer to the upper (80) than the lower (20).
    fireEvent.pointerDown(track, { clientX: 70 })
    expect(onInput).toHaveBeenCalledWith([20, 70])
  })

  it('leaves a press on a thumb to the native drag (no jump)', () => {
    const { onInput, lower } = setup({ value: [20, 80] })
    stubTrackWidth(lower.parentElement as HTMLElement)
    // Pressing the input (thumb) must NOT trigger a track jump — it targets the
    // <input>, which the handler skips so the native drag owns the gesture.
    fireEvent.pointerDown(lower, { clientX: 90 })
    expect(onInput).not.toHaveBeenCalled()
  })
})
