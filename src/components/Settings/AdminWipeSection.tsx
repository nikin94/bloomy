import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/Button/Button'
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal'
import { useOrderCache } from '@/queries/orders'
import { useCustomerCache } from '@/queries/customers'
import type { WipeResult } from '@/firebase/seed'

// Admin-only "clean slate" tool, rendered in the settings page's admin tab (see
// isAdmin): hard-deletes EVERY order and customer of the admin's own account.
// Added ahead of the order-status migration so the admin's test data is gone
// before real users' documents are migrated. Destructive and irreversible (no
// trash), so it is gated behind the app's standard ConfirmModal. The wipe code
// lives in the seed module and is loaded with a DYNAMIC import only on confirm,
// mirroring AdminSeedSection — none of it ships in the main bundle.
const AdminWipeSection = ({ ownerId }: { ownerId: string }) => {
  // common: the confirm dialog's Delete/Cancel button labels.
  const { t } = useTranslation(['settings', 'common'])
  const orderCache = useOrderCache()
  const customerCache = useCustomerCache()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WipeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setConfirming(false)
    if (busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const { wipeOwnerData } = await import('@/firebase/seed')
      setResult(await wipeOwnerData(ownerId))
      // Drop every cached list/detail (orders, trash, customers): the shared
      // query cache still holds the pre-wipe data, so without this the trash —
      // or any list visited within the stale window — would keep showing the
      // just-deleted documents until a full page reload.
      orderCache.invalidateAll()
      customerCache.invalidateAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.wipeError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="m-0 text-sm font-medium text-heading">{t('admin.wipeTitle')}</p>

      <Button
        variant="danger"
        onClick={() => setConfirming(true)}
        isLoading={busy}
        className="self-start"
      >
        {t('admin.wipe')}
      </Button>

      {result && (
        <p role="status" className="m-0 text-sm text-text">
          {t('admin.wipeResult', {
            removedOrders: result.removedOrders,
            removedCustomers: result.removedCustomers,
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}

      {confirming && (
        <ConfirmModal
          title={t('admin.wipeConfirmTitle')}
          body={t('admin.wipeConfirmBody')}
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          onConfirm={run}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  )
}

export default AdminWipeSection
