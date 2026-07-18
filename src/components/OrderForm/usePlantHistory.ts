import { useMemo } from 'react'
import { useOrders } from '@/queries/orders'
import { collectPlantNames } from '@/types/order'

// Plant-name autocomplete suggestions + the per-customer gift history, derived
// from the owner's active orders via the SHARED query cache (the same entry the
// orders list holds, so opening the form from the list costs no extra read).
// Non-critical by design: a failed or slow load must never block or gate the
// form — the query is non-suspending and everything falls back to empty (the
// name field then works as a plain input, and no gift warning shows).
export function usePlantHistory(
  ownerId: string | undefined,
  // The order being EDITED is excluded from the gift history, so a form seeded
  // with its own gift doesn't warn about itself.
  excludeOrderId: string | undefined,
): {
  suggestions: string[]
  // customerId → lowercased gift names already sent, feeding the non-blocking
  // "this gift was already sent to this customer" warning.
  sentGiftsByCustomer: Map<string, Set<string>>
} {
  const { data: orders } = useOrders(ownerId)
  return useMemo(() => {
    if (!orders) return { suggestions: [], sentGiftsByCustomer: new Map() }
    const sent = new Map<string, Set<string>>()
    for (const o of orders) {
      if (o.id === excludeOrderId) continue
      for (const gift of o.gifts ?? []) {
        const key = gift.name.trim().toLowerCase()
        if (key === '') continue
        const names = sent.get(o.customerId) ?? new Set<string>()
        names.add(key)
        sent.set(o.customerId, names)
      }
    }
    return { suggestions: collectPlantNames(orders), sentGiftsByCustomer: sent }
  }, [orders, excludeOrderId])
}
