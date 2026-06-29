import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../Button/Button'
import type { SeedResult } from '../../firebase/seed'

// Admin-only test-data tool, rendered at the bottom of the settings dialog for
// the admin account (see isAdmin). The heavy seeder (and its fixtures) is loaded
// with a DYNAMIC import only when the button is pressed, so neither the mock data
// nor the destructive code ships in the main bundle for ordinary users.
//
// The reset toggle hard-deletes the account's existing orders/customers before
// seeding; because that is destructive it asks for an explicit confirm first.
const AdminSeedSection = ({ ownerId }: { ownerId: string }) => {
  const { t } = useTranslation('settings')
  const [reset, setReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (busy) return
    if (reset && !window.confirm(t('admin.confirmReset'))) {
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const { seedMockData } = await import('../../firebase/seed')
      setResult(await seedMockData(ownerId, { reset }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span aria-hidden="true" className="h-px w-full bg-border" />
      <section className="flex flex-col gap-2">
        <p className="m-0 text-sm font-medium text-heading">{t('admin.title')}</p>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={reset}
            onChange={(e) => setReset(e.target.checked)}
            disabled={busy}
          />
          {t('admin.resetLabel')}
        </label>

        <Button variant="secondary" onClick={run} isLoading={busy} className="self-start">
          {t('admin.seed')}
        </Button>

        {result && (
          <p role="status" className="m-0 text-sm text-text">
            {t('admin.result', {
              customers: result.customers,
              orders: result.orders,
              trashed: result.trashed,
            })}
            {result.reset &&
              t('admin.resultReset', {
                removedOrders: result.removedOrders,
                removedCustomers: result.removedCustomers,
              })}
            {t('admin.resultReload')}
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        )}
      </section>
    </>
  )
}

export default AdminSeedSection
