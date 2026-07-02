import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { deleteOrderPhoto, getPhotoUrl, uploadOrderPhoto } from '../../firebase/photos'
import { reportError } from '../../observability/reportError'
import Button from '../Button/Button'
import Loader from '../Loader/Loader'
import Modal from '../Modal/Modal'

// Photo gallery for an order: a horizontal strip of thumbnails plus an "add"
// tile, and a full-screen swiper to view them. Lives on the order detail page,
// where the order already exists (so its id is known and photos can be stored
// under orders/{ownerId}/{orderId}/...). Uploads need a live connection (Storage
// has no offline queue); a failure is surfaced inline. Photo paths are owned by
// the parent (`photos`) — every add/remove calls `onChange` with the new full
// list, which the page persists via patchOrder.

export const CameraIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-6"
  >
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
)

// Viewer nav chevron. A stroked SVG (not the ‹/› glyphs, which sit off-centre in
// their em-box) so `flex items-center justify-center` centres it exactly in the
// round button. `direction` flips it left/right.
const ViewerChevron = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-6"
  >
    {direction === 'left' ? (
      <polyline points="15 18 9 12 15 6" />
    ) : (
      <polyline points="9 18 15 12 9 6" />
    )}
  </svg>
)

// A single resolved thumbnail. Resolves its download URL lazily (cached in the
// photos layer) and shows a loader until then. The image opens the viewer; the
// × requests deletion.
export const Thumb = ({
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

// Full-screen swiper. A horizontal scroll-snap track of full images; Esc closes,
// arrows step. `pointer-events` stay on the controls so a tap on the backdrop
// (outside an image) closes it.
export const PhotoViewer = ({
  urls,
  startIndex,
  onClose,
}: {
  urls: (string | undefined)[]
  startIndex: number
  onClose: () => void
}) => {
  const { t } = useTranslation(['order', 'common'])
  const trackRef = useRef<HTMLDivElement>(null)

  // Jump to the opened photo on mount (no smooth scroll — it should appear there).
  useEffect(() => {
    const track = trackRef.current
    if (track) track.scrollLeft = startIndex * track.clientWidth
  }, [startIndex])

  // Esc closes; arrows step one slide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      const track = trackRef.current
      if (!track) return
      if (e.key === 'ArrowRight') track.scrollBy({ left: track.clientWidth, behavior: 'smooth' })
      if (e.key === 'ArrowLeft') track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const step = (dir: 1 | -1) => {
    const track = trackRef.current
    if (track) track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('photos.view')}
      // A tap anywhere on the backdrop (the empty area around the photo, and the
      // header/footer gaps) closes the viewer. The photo itself and the nav
      // buttons stop propagation, so tapping them doesn't also close.
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
    >
      <div className="flex justify-end p-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common:close')}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div
        ref={trackRef}
        className="scrollbar-hidden flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        {urls.map((url, i) => (
          <div key={i} className="flex w-full shrink-0 snap-center items-center justify-center p-4">
            {url ? (
              <img
                src={url}
                alt={t('photos.alt')}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-white">
                <Loader size="md" />
              </span>
            )}
          </div>
        ))}
      </div>
      {urls.length > 1 && (
        // stopPropagation so stepping through photos doesn't bubble to the
        // backdrop's close handler.
        <div className="flex justify-center gap-6 p-4" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={t('photos.prev')}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ViewerChevron direction="left" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={t('photos.next')}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ViewerChevron direction="right" />
          </button>
        </div>
      )}
    </div>
  )
}

const OrderPhotos = ({
  ownerId,
  orderId,
  photos,
  onChange,
  readOnly = false,
}: {
  ownerId: string
  orderId: string
  photos: string[]
  onChange: (photos: string[]) => void
  // Deleted order: show existing photos + the fullscreen viewer, but hide the
  // add tile and the per-thumb delete so no write hits the soft-deleted doc.
  readOnly?: boolean
}) => {
  const { t } = useTranslation(['order', 'common'])
  // Resolved download URLs keyed by storage path.
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Paths we've already kicked off a URL request for — guards the resolve effect
  // so a resolved URL (state change) doesn't re-trigger it for every thumbnail.
  const requestedRef = useRef<Set<string>>(new Set())
  // Always-current photo list for async callbacks, so a slow upload doesn't
  // restore a concurrently-removed photo when it finally calls onChange.
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  // True for the component's whole lifetime; flipped only on a REAL unmount.
  // The resolve effect below must NOT use a per-run flag: `requestedRef`
  // (a ref) survives a re-run, so under StrictMode's mount→cleanup→mount the
  // second run skips the already-requested path while the first run's resolved
  // URL would be discarded by a per-run `active=false` — leaving the thumbnail
  // stuck on its loader forever (the bug seen on re-entering an order with
  // existing photos). Gating on a mount-lifetime flag keeps the resolved URL.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Resolve a download URL for every path we haven't requested yet. Keyed off
  // `photos` only — `requestedRef` (not the `urls` state) tracks in-flight ones.
  // setUrls is keyed by path (idempotent), so applying a late resolve is always
  // safe; we only skip it once the component has truly unmounted.
  useEffect(() => {
    for (const path of photos) {
      if (requestedRef.current.has(path)) continue
      requestedRef.current.add(path)
      getPhotoUrl(path)
        .then((url) => {
          if (mountedRef.current) setUrls((prev) => ({ ...prev, [path]: url }))
        })
        .catch((err: unknown) => {
          // Allow a retry on the next render once the connection is back.
          requestedRef.current.delete(path)
          reportError(err, 'getPhotoUrl')
        })
    }
  }, [photos])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploading(true)
    // Upload in parallel — on a slow/filtered link a sequential await would
    // stack the waits. allSettled keeps every success even if one file fails.
    const results = await Promise.allSettled(
      Array.from(files).map((file) => uploadOrderPhoto(ownerId, orderId, file)),
    )
    const added: string[] = []
    let failed = false
    for (const result of results) {
      if (result.status === 'fulfilled') added.push(result.value)
      else {
        failed = true
        reportError(result.reason, 'uploadOrderPhoto')
      }
    }
    // Persist whatever uploaded (read the live list, not the closure) so a
    // partial failure leaves no orphan blob the user can't see or delete.
    if (added.length > 0) onChange([...photosRef.current, ...added])
    if (failed) {
      setUploadError(t('photos.uploadError'))
    }
    setUploading(false)
    // Reset so picking the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Remove a photo: drop it from the list at once (so the UI updates and the
  // order doc is patched offline-safely), then best-effort delete the file from
  // Storage. A failed file delete only leaves an orphan blob, not a UI error.
  const confirmDelete = () => {
    const path = pendingDelete
    if (!path) return
    setPendingDelete(null)
    onChange(photos.filter((p) => p !== path))
    deleteOrderPhoto(path).catch((err: unknown) => reportError(err, 'deleteOrderPhoto'))
  }

  // Read-only with nothing to show: skip the section entirely (no empty "Фото"
  // heading on a deleted order that never had photos).
  if (readOnly && photos.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-semibold text-heading">{t('photos.title')}</h2>

      <div className="flex flex-wrap gap-3">
        {photos.map((path, index) => (
          <Thumb
            key={path}
            url={urls[path]}
            t={t}
            onOpen={() => setViewerIndex(index)}
            onDelete={readOnly ? undefined : () => setPendingDelete(path)}
          />
        ))}

        {/* Add tile — opens the device camera or gallery (mobile) / file picker. */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label={t('photos.add')}
            className="flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text hover:bg-primary-bg disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {uploading ? <Loader size="md" /> : <CameraIcon />}
          </button>
        )}
      </div>

      {/* `capture="environment"` hints the rear camera on mobile but still lets
          the user pick from the gallery; `multiple` allows several at once. */}
      {!readOnly && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      )}

      {uploadError && (
        <p role="alert" className="m-0 text-sm text-danger">
          {uploadError}
        </p>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          urls={photos.map((p) => urls[p])}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}

      {pendingDelete && (
        <Modal title={t('photos.deleteTitle')} onClose={() => setPendingDelete(null)}>
          <p className="m-0 text-text">{t('photos.deleteBody')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={confirmDelete}>
              {t('common:delete')}
            </Button>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              {t('common:cancel')}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  )
}

export default OrderPhotos
