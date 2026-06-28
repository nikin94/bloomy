// Exercises the i18n engine directly — the part most likely to surprise: Russian
// has four plural forms (one/few/many/other → день/дня/дней), which i18next picks
// via Intl.PluralRules from the `days_one/_few/_many/_other` keys. This locks that
// in and proves a language switch swaps both translations and plural rules.
import { describe, it, expect } from 'vitest'
import i18n from './config'

describe('i18n', () => {
  it('initialises with Russian as the default language', () => {
    expect(i18n.language).toBe('ru')
  })

  it('resolves keys across namespaces', () => {
    expect(i18n.t('nav:orders')).toBe('Заказы')
    expect(i18n.t('settings:title')).toBe('Настройки')
    expect(i18n.t('common:save')).toBe('Сохранить')
  })

  // 1→день, 2-4→дня, 5-20→дней, then it repeats by the last digit(s).
  it.each([
    [1, '1 день'],
    [2, '2 дня'],
    [4, '4 дня'],
    [5, '5 дней'],
    [11, '11 дней'],
    [21, '21 день'],
    [22, '22 дня'],
    [25, '25 дней'],
  ])('pluralises %i days the Russian way', (count, expected) => {
    expect(i18n.t('common:days', { count })).toBe(expected)
  })

  it('switches translations AND plural rules when the language changes', async () => {
    await i18n.changeLanguage('en')
    try {
      expect(i18n.t('nav:orders')).toBe('Orders')
      expect(i18n.t('common:days', { count: 1 })).toBe('1 day')
      expect(i18n.t('common:days', { count: 5 })).toBe('5 days')
    } finally {
      // Restore the default so any later assertion in this file sees Russian.
      await i18n.changeLanguage('ru')
    }
  })
})
