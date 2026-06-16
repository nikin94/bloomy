import { describe, expect, it } from 'vitest'
import {
  clampFontScale,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  STORED_SETTINGS_SCHEMA,
  DEFAULT_THEME,
} from './settings'

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

describe('STORED_SETTINGS_SCHEMA', () => {
  it('accepts an empty document (every field is optional)', () => {
    expect(STORED_SETTINGS_SCHEMA.safeParse({}).success).toBe(true)
  })

  it('accepts the known themes', () => {
    expect(STORED_SETTINGS_SCHEMA.parse({ theme: 'light' }).theme).toBe('light')
    expect(STORED_SETTINGS_SCHEMA.parse({ theme: 'dark' }).theme).toBe('dark')
  })

  it('rejects an unknown theme value', () => {
    expect(STORED_SETTINGS_SCHEMA.safeParse({ theme: 'sepia' }).success).toBe(false)
  })

  it('leaves a legacy document without a theme valid → defaults to dark', () => {
    const parsed = STORED_SETTINGS_SCHEMA.parse({ fontScale: 1.25 })
    expect(parsed.theme).toBeUndefined()
    expect(parsed.theme ?? DEFAULT_THEME).toBe('dark')
  })

  it('accepts the optional order defaults (delivery + payment method)', () => {
    const parsed = STORED_SETTINGS_SCHEMA.parse({
      defaultDeliveryMethod: 'cdek',
      defaultPaymentMethod: 'card',
    })
    expect(parsed.defaultDeliveryMethod).toBe('cdek')
    expect(parsed.defaultPaymentMethod).toBe('card')
  })

  it('rejects an unknown delivery/payment method', () => {
    expect(STORED_SETTINGS_SCHEMA.safeParse({ defaultDeliveryMethod: 'drone' }).success).toBe(false)
    expect(STORED_SETTINGS_SCHEMA.safeParse({ defaultPaymentMethod: 'crypto' }).success).toBe(false)
  })
})
