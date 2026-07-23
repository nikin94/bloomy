// Exercises the i18n engine directly — the part most likely to surprise: Russian
// has four plural forms (one/few/many/other → заказ/заказа/заказов), which
// i18next picks via Intl.PluralRules from `_one/_few/_many/_other` key suffixes
// (e.g. the trash confirm's `emptyTrashBody_*`, the stats tab's `orders_*`).
// This locks that in and proves a language switch swaps both translations and
// plural rules.
import { describe, it, expect } from 'vitest'
import i18n, { resources } from './config'

// i18next plural keys end in a CLDR category suffix; English legitimately has
// fewer forms than Russian (no _few/_many), so parity is checked on the BASE key.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

// Flattens a (possibly nested) dictionary into dotted base keys, dropping plural
// suffixes, so two locales can be compared regardless of how many plural forms
// each declares.
const baseKeys = (dict: Record<string, unknown>, prefix = ''): Set<string> => {
  const out = new Set<string>()
  for (const [key, value] of Object.entries(dict)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') {
      for (const nested of baseKeys(value as Record<string, unknown>, full)) out.add(nested)
    } else {
      out.add(full.replace(PLURAL_SUFFIX, ''))
    }
  }
  return out
}

describe('i18n', () => {
  it('initialises with Russian as the default language', () => {
    expect(i18n.language).toBe('ru')
  })

  it('resolves keys across namespaces', () => {
    expect(i18n.t('nav:orders')).toBe('Заказы')
    expect(i18n.t('settings:title')).toBe('Настройки')
    expect(i18n.t('common:save')).toBe('Сохранить')
  })

  // 1→заказ, 2-4→заказа, 5-20→заказов, then it repeats by the last digit(s).
  it.each([
    [1, '1 заказ будет удалён'],
    [2, '2 заказа будут удалены'],
    [5, '5 заказов будут удалены'],
    [21, '21 заказ будет удалён'],
    [22, '22 заказа будут удалены'],
    [25, '25 заказов будут удалены'],
  ])('pluralises %i trashed orders the Russian way', (count, expected) => {
    expect(i18n.t('order:trash.emptyTrashBody', { count })).toContain(expected)
  })

  // fallbackLng is the Russian default, so a key present in ru but missing in en
  // would silently render a Russian string inside the English UI. CustomTypeOptions
  // only type-checks against ru, so TS can't catch this — this test does.
  // Derived from the resources (not a hardcoded list) so a newly added namespace
  // is parity-checked automatically instead of slipping through untested.
  it.each(Object.keys(resources.ru) as (keyof (typeof resources)['ru'])[])(
    'en defines every key ru has in "%s" (plural forms aside)',
    (ns) => {
      const ru = baseKeys(resources.ru[ns])
      const en = baseKeys(resources.en[ns])
      expect([...ru].filter((key) => !en.has(key))).toEqual([])
    },
  )

  it('switches translations AND plural rules when the language changes', async () => {
    await i18n.changeLanguage('en')
    try {
      expect(i18n.t('nav:orders')).toBe('Orders')
      expect(i18n.t('order:trash.emptyTrashBody', { count: 1 })).toContain('1 order will be')
      expect(i18n.t('order:trash.emptyTrashBody', { count: 5 })).toContain('5 orders will be')
      // Order-domain labels (table headers + status/method values) switch too.
      expect(i18n.t('order:columns.customer')).toBe('Customer')
      expect(i18n.t('order:paymentStatus.paid')).toBe('Paid')
      expect(i18n.t('order:deliveryMethod.cdek')).toBe('CDEK')
    } finally {
      // Restore the default so any later assertion in this file sees Russian.
      await i18n.changeLanguage('ru')
    }
  })
})
