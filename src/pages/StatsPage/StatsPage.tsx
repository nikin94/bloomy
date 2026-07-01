import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/Spinner/Spinner'
import { fetchOrders } from '../../firebase/orders'
import { useAuth } from '../../context/authContext'
import { formatMoney } from '../../utils/format'
import { revenueByCurrencyMinor, CURRENCIES } from '../../types/order'
import type { Order } from '../../types/order'
import {
  STATS_PERIODS,
  filterOrdersByPeriod,
  deliveryByCurrencyMinor,
  statusBreakdown,
  ordersPerMonth,
} from '../../types/stats'
import type { StatsPeriod } from '../../types/stats'

// How many months the "orders by month" chart spans. Fixed at a year so the
// seasonal shape reads regardless of the period selector above it.
const MONTHS_WINDOW = 12

// Statistics tab: business metrics derived entirely IN MEMORY from the owner's
// orders (fetchOrders already drops deleted ones), so the page is offline-safe
// and needs no schema change. A period selector scopes the KPI cards + status
// breakdown (this month / this year / all time); the monthly chart always spans
// the last 12 months. Money is multi-currency with NO conversion, so every money
// figure is grouped per currency and paid-only (a realized amount).
const StatsPage = () => {
  const { t, i18n } = useTranslation(['stats', 'common'])
  // Guaranteed non-null under ProtectedRoute, but read defensively and gate on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  // Capture one timestamp at mount: period boundaries and the month buckets must
  // be stable across renders, and a render-time Date.now() isn't pure.
  const [now] = useState(() => Date.now())
  const [period, setPeriod] = useState<StatsPeriod>('month')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ownerId) return
    let active = true
    fetchOrders(ownerId)
      .then((data) => {
        if (active) setOrders(data)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : t('loadError'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // `t` is only read in the error fallback; depending on it would refetch on a
    // language switch, so it's intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  // Everything below is derived per render from the loaded orders (cheap — the
  // list is small). The KPIs + breakdown follow the selected period; the chart
  // deliberately spans the full year window.
  const periodOrders = filterOrdersByPeriod(orders, period, now)
  const revenue = revenueByCurrencyMinor(periodOrders)
  const delivery = deliveryByCurrencyMinor(periodOrders)
  // Currencies to show a money card for: any that has paid revenue OR delivery in
  // the period, in the canonical currency order.
  const moneyCurrencies = CURRENCIES.filter((c) => revenue.has(c) || delivery.has(c))
  const breakdown = statusBreakdown(periodOrders)
  const monthly = ordersPerMonth(orders, now, MONTHS_WINDOW)
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count))

  const locale = i18n.language === 'en' ? 'en-US' : 'ru-RU'
  const monthShort = (ms: number) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(ms))
  const monthLong = (ms: number) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(ms))

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      {loading && <Spinner />}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="m-0 text-2xl font-semibold text-heading">{t('title')}</h1>

            {/* Period selector — radio semantics (one active choice). Hidden when
                there is no data to scope. */}
            {orders.length > 0 && (
              <div
                role="radiogroup"
                aria-label={t('period.aria')}
                className="inline-flex rounded-full border border-border bg-primary-bg p-1 text-sm font-medium"
              >
                {STATS_PERIODS.map((p) => {
                  const selected = p === period
                  return (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPeriod(p)}
                      className={`rounded-full px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        selected ? 'bg-primary text-white shadow-sm' : 'text-text hover:text-heading'
                      }`}
                    >
                      {t(`period.${p}`)}
                    </button>
                  )
                })}
              </div>
            )}
          </header>

          {orders.length === 0 ? (
            <p className="m-0 text-text">{t('empty')}</p>
          ) : (
            <>
              {/* KPI cards: order count + per-currency money broken into
                  plants / delivery / total (total = plants + delivery). */}
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
                  <span className="text-sm text-text">{t('totalOrders')}</span>
                  <span className="text-3xl font-semibold tabular-nums text-heading">
                    {periodOrders.length}
                  </span>
                </div>

                {moneyCurrencies.length === 0 ? (
                  <div className="flex items-center rounded-lg border border-border bg-surface p-4 text-sm text-text">
                    {t('money.empty')}
                  </div>
                ) : (
                  moneyCurrencies.map((c) => {
                    const totalMinor = revenue.get(c) ?? 0
                    const deliveryMinor = delivery.get(c) ?? 0
                    // `revenue` already includes delivery (getTotalMinor = plants +
                    // delivery), so plants = revenue − delivery. Showing all three
                    // avoids the misread where Revenue/Delivery look additive.
                    const plantsMinor = totalMinor - deliveryMinor
                    return (
                      <div
                        key={c}
                        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-text">{t('money.plants')}</span>
                          <span className="tabular-nums text-heading">
                            {formatMoney(plantsMinor, c)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-text">{t('money.delivery')}</span>
                          <span className="tabular-nums text-heading">
                            {formatMoney(deliveryMinor, c)}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                          <span className="text-sm text-text">{t('money.total')}</span>
                          <span className="text-lg font-semibold tabular-nums text-heading">
                            {formatMoney(totalMinor, c)}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </section>
              <p className="-mt-4 text-xs text-text">{t('money.hint')}</p>

              {/* Status breakdown — the share delivered / cancelled / in progress
                  for the period. A stacked bar plus a legend with exact counts. */}
              {breakdown.total > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="m-0 text-lg font-semibold text-heading">{t('status.title')}</h2>
                  <div
                    className="flex h-3 w-full overflow-hidden rounded-full bg-border"
                    role="img"
                    aria-label={`${t('status.delivered')}: ${breakdown.delivered}, ${t('status.cancelled')}: ${breakdown.cancelled}, ${t('status.inProgress')}: ${breakdown.inProgress}`}
                  >
                    <span
                      className="block bg-primary"
                      style={{ width: `${(breakdown.delivered / breakdown.total) * 100}%` }}
                    />
                    <span
                      className="block bg-text"
                      style={{ width: `${(breakdown.inProgress / breakdown.total) * 100}%` }}
                    />
                    <span
                      className="block bg-danger"
                      style={{ width: `${(breakdown.cancelled / breakdown.total) * 100}%` }}
                    />
                  </div>
                  <ul className="m-0 flex flex-wrap gap-x-6 gap-y-1 p-0 text-sm">
                    <LegendItem dot="bg-primary" label={t('status.delivered')} value={breakdown.delivered} />
                    <LegendItem dot="bg-text" label={t('status.inProgress')} value={breakdown.inProgress} />
                    <LegendItem dot="bg-danger" label={t('status.cancelled')} value={breakdown.cancelled} />
                  </ul>
                </section>
              )}

              {/* Orders by month — the last 12 months, so the seasonal shape is
                  readable. Independent of the period selector on purpose. */}
              <section className="flex flex-col gap-2">
                <div>
                  <h2 className="m-0 text-lg font-semibold text-heading">{t('chart.title')}</h2>
                  <p className="m-0 text-sm text-text">{t('chart.subtitle')}</p>
                </div>
                <div className="flex items-end gap-1">
                  {monthly.map((bucket) => (
                    <div
                      key={bucket.monthStart}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    >
                      <span className="h-4 text-xs tabular-nums text-text">
                        {bucket.count || ''}
                      </span>
                      <div className="flex h-28 w-full items-end">
                        <div
                          className="w-full rounded-t bg-primary"
                          style={{ height: `${(bucket.count / maxMonthly) * 100}%` }}
                          title={`${monthLong(bucket.monthStart)} — ${t('orders', { count: bucket.count })}`}
                        />
                      </div>
                      <span className="text-[0.65rem] text-text">{monthShort(bucket.monthStart)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// One legend row for the status bar: a colour dot (matching a bar segment) plus
// the label and exact count.
const LegendItem = ({ dot, label, value }: { dot: string; label: string; value: number }) => (
  <li className="flex items-center gap-2">
    <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
    <span className="text-text">{label}</span>
    <span className="tabular-nums font-medium text-heading">{value}</span>
  </li>
)

export default StatsPage
