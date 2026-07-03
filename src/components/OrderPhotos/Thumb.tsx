import type { TFunction } from 'i18next'
import Loader from '@/components/Loader/Loader'

// A single resolved thumbnail. Resolves its download URL lazily (cached in the
// photos layer) and shows a loader until then. The image opens the viewer; the
// × requests deletion.
const Thumb = ({
  url,
  t,
  onOpen,
  onDelete,
}: {
  url: string | undefined
  // Passed from the parent (which subscribes to i18next once) so each thumbnail
  // row doesn't open its own useTranslation subscription.
  t: TFunction<['order', 'common']>
  onOpen: () => void
  // Omitted in read-only mode (deleted order) — the × isn't rendered then.
  onDelete?: () => void
}) => {
  return (
  <div className="relative size-20 shrink-0">
    <button
      type="button"
      onClick={onOpen}
      className="size-full overflow-hidden rounded-md border border-border bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label={t('photos.open')}
    >
      {url ? (
        <img src={url} alt={t('photos.alt')} className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-text">
          <Loader size="sm" />
        </span>
      )}
    </button>
    {onDelete && (
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('photos.delete')}
        title={t('photos.delete')}
        className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-border bg-bg text-text shadow-sm hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true" className="text-sm leading-none">
          ✕
        </span>
      </button>
    )}
  </div>
  )
}

export default Thumb
