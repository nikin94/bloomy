import { describe, expect, it } from 'vitest'
import { clampFontScale, FONT_SCALE_MAX, FONT_SCALE_MIN } from './settings'

describe('clampFontScale', () => {
  it('keeps an in-range value unchanged', () => {
    expect(clampFontScale(1)).toBe(1)
  })

  it('clamps a value below the minimum', () => {
    expect(clampFontScale(0.5)).toBe(FONT_SCALE_MIN)
  })

  it('clamps a value above the maximum', () => {
    expect(clampFontScale(3)).toBe(FONT_SCALE_MAX)
  })
})
