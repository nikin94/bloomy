import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Spinner from '../../components/Spinner/Spinner'
import Select from '../../components/Select/Select'
import { FIELD_BASE, FIELD_NORMAL } from '../../styles/fieldStyles'
import { fetchOrders } from '../../firebase/orders'
import { useAuth } from '../../context/authContext'
import { formatMoney, toDateInputValue } from '../../utils/format'
import { revenueByCurrencyMinor, CURRENCIES } from '../../types/order'
import type { Order } from '../../types/order'
import {
  STATS_PRESETS,
  presetRange,
  customRange,
  filterOrdersByRange,
  deliveryByCurrencyMinor,
  statusBreakdown,
  ordersPerMonth,
  monthBounds,
} from '../../types/stats'
import type { StatsPreset } from '../../types/stats'

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
  const navigate = useNavigate()
  // Guaranteed non-null under ProtectedRoute, but read defensively and gate on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  // Capture one timestamp at mount: period boundaries and the month buckets must
  // be stable across renders, and a render-time Date.now() isn't pure.
  const [now] = useState(() => Date.now())
  const [preset, setPreset] = useState<StatsPreset>('month')
  // Custom-range bounds (yyyy-mm-dd, as <input type="date"> produces). Read only
  // while `preset === 'custom'`; an empty side leaves that bound open.
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
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
  const range = preset === 'custom' ? customRange(customFrom, customTo) : presetRange(preset, now)
  const periodOrders = filterOrdersByRange(orders, range)
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

  // Selectable bounds for the custom date fields: no earlier than the earliest
  // order, no later than today. Cross-linking the two (from.max ≤ to, to.min ≥
  // from) additionally stops the range being inverted. Native min/max clamp the
  // picker and flag an out-of-range value — the pragmatic guard for one operator.
  const earliestOrderMs =
    orders.length > 0 ? Math.min(...orders.map((o) => o.dateCreated)) : now
  const minDateInput = toDateInputValue(earliestOrderMs)
  const maxDateInput = toDateInputValue(now)

  // Open the orders list scoped to a clicked month. The date range rides in
  // router state (like the create-order highlight); OrdersPage seeds its filter
  // from it and strips the state so a refresh doesn't replay it.
  const openMonth = (monthStart: number) => {
    const { start, end } = monthBounds(monthStart)
    navigate('/orders', { state: { dateFilter: { minDate: start, maxDate: end } } })
  }

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

            {/* Period selector — a dropdown of presets plus a "custom range"
                option (native <select> = the expected mobile control, and it
                scales to more presets without crowding the header). Hidden when
                there is no data to scope. */}
            {orders.length > 0 && (
              <div className="w-48 shrink-0">
                <Select
                  aria-label={t('period.aria')}
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as StatsPreset)}
                >
                  {STATS_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {t(`period.${p}`)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </header>

          {/* Custom range: two native date fields, shown only for the custom
              preset. `max`/`min` cross-link them so the range can never be
              inverted; an empty side leaves that bound open (e.g. only "from" =
              everything since that day). Native date inputs are mobile-friendly
              and need no extra library. Top-label (not the shared floating-label
              <Input>) on purpose: a native date input always paints a browser
              format hint, so `:placeholder-shown` never matches and a floating
              label would never settle down — keep them plain. */}
          {orders.length > 0 && preset === 'custom' && (
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm text-text">
                {t('period.from')}
                <input
                  type="date"
                  value={customFrom}
                  min={minDateInput}
                  max={customTo || maxDateInput}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className={`${FIELD_BASE} ${FIELD_NORMAL} px-3 py-2 text-heading`}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text">
                {t('period.to')}
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || minDateInput}
                  max={maxDateInput}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={`${FIELD_BASE} ${FIELD_NORMAL} px-3 py-2 text-heading`}
                />
              </label>
            </div>
          )}

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
                    {/* Two distinct empty states so the operator knows WHY money is
                        zero: no orders in the range at all vs orders exist but none
                        are paid yet. Common now that custom ranges can select an
                        empty window. */}
                    {periodOrders.length === 0 ? t('money.emptyPeriod') : t('money.empty')}
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
                  {monthly.map((bucket, i) => {
                    // All 12 month names don't fit side by side on a phone (a ~24px
                    // column vs a ~30px name → they'd collide, and the user font-scale
                    // makes them wider still). So label only every OTHER month on
                    // mobile — counted from the end, so the latest month is always
                    // labelled and the labelled set doesn't shuffle as the window rolls.
                    // `sm+` has the width for all 12. Hidden labels stay `invisible`
                    // (not removed) so the column keeps its height and the bars stay
                    // aligned; the full "month year" is always in the bar's tooltip.
                    const labelOnMobile = (monthly.length - 1 - i) % 2 === 0
                    // Only a month WITH orders is clickable: filtering the list to an
                    // empty month would land on "nothing found", so a link there is a
                    // dead end. Empty months render as a plain (non-interactive)
                    // column — no hover tint, no link — so the affordance points only
                    // at the green bars that actually lead somewhere.
                    const hasOrders = bucket.count > 0
                    // Shared column body (count, bar, label); the wrapper differs by
                    // whether the month is clickable.
                    const body = (
                      <>
                        <span className="h-4 text-xs tabular-nums text-text">
                          {bucket.count || ''}
                        </span>
                        <div className="flex h-28 w-full items-end">
                          <div
                            className="w-full rounded-t bg-primary transition-opacity group-hover:opacity-80"
                            style={{ height: `${(bucket.count / maxMonthly) * 100}%` }}
                          />
                        </div>
                        <span
                          className={`whitespace-nowrap text-xs font-semibold text-heading ${
                            labelOnMobile ? '' : 'invisible sm:visible'
                          }`}
                        >
                          {monthShort(bucket.monthStart)}
                        </span>
                      </>
                    )
                    // A column with orders is a button: hovering tints it (a clear
                    // "clickable" affordance) and a click opens the orders list
                    // filtered to that month. A native <button> gives keyboard
                    // (Enter/Space) + focus for free; its accessible name carries
                    // the month, its order count, and the action.
                    return hasOrders ? (
                      <button
                        key={bucket.monthStart}
                        type="button"
                        onClick={() => openMonth(bucket.monthStart)}
                        title={`${monthLong(bucket.monthStart)} — ${t('orders', { count: bucket.count })}`}
                        aria-label={`${monthLong(bucket.monthStart)}: ${t('orders', { count: bucket.count })}. ${t('chart.openMonth')}`}
                        className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded px-0.5 py-1 transition-colors hover:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {body}
                      </button>
                    ) : (
                      <div
                        key={bucket.monthStart}
                        title={`${monthLong(bucket.monthStart)} — ${t('orders', { count: bucket.count })}`}
                        className="group flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-1"
                      >
                        {body}
                      </div>
                    )
                  })}
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
