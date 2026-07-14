import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteOrderPhoto, getPhotoUrl, uploadOrderPhoto } from '@/firebase/photos'
import { reportError } from '@/observability/reportError'
import Button from '@/components/Button/Button'
import Loader from '@/components/Loader/Loader'
import Modal from '@/components/Modal/Modal'
import CameraIcon from '@/components/icons/CameraIcon'
import GalleryIcon from '@/components/icons/GalleryIcon'
import PhotoViewer from './PhotoViewer'
import Thumb from './Thumb'
import { FOCUS_RING } from '@/styles/fieldStyles'

// Photo gallery for an order: a horizontal strip of thumbnails plus an "add"
// tile, and a full-screen swiper to view them. Lives on the order detail page,
// where the order already exists (so its id is known and photos can be stored
// under orders/{ownerId}/{orderId}/...). Uploads need a live connection (Storage
// has no offline queue); a failure is surfaced inline. Photo paths are owned by
// the parent (`photos`) — every add/remove calls `onChange` with the new full
// list, which the page persists via patchOrder.

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
  // Two hidden inputs behind the two add tiles: the gallery one has NO `capture`
  // (native picker → photo library / files), the camera one carries
  // `capture="environment"` (opens the rear camera directly on a phone).
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
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
    if (galleryInputRef.current) galleryInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
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

  // Read-only with nothing to show: skip the section entirely (no empty "Photos"
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

        {/* Two add tiles — the icons say which flow each opens. GALLERY (picture
            glyph): the native picker, i.e. the phone photo library / desktop file
            dialog. CAMERA (camera glyph): straight to the device camera. One
            capture-less tile can't cover both — with `capture` set some mobile
            browsers jump to the camera with no gallery option, and without it
            Android's photo picker often offers no camera. While an upload is in
            flight both collapse into a single disabled loader tile. */}
        {!readOnly &&
          (uploading ? (
            <span
              aria-label={t('photos.add')}
              className="flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text opacity-50"
            >
              <Loader size="md" />
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                aria-label={t('photos.add')}
                className={`flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text hover:bg-primary-bg ${FOCUS_RING}`}
              >
                <GalleryIcon />
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                aria-label={t('photos.capture')}
                className={`flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text hover:bg-primary-bg ${FOCUS_RING}`}
              >
                <CameraIcon />
              </button>
            </>
          ))}
      </div>

      {!readOnly && (
        <>
          {/* The gallery input has NO `capture`, so a phone opens its photo
              library / file picker; `multiple` allows several at once. */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {/* The camera input's `capture="environment"` opens the rear camera
              directly on a phone (a desktop browser ignores it — plain file dialog). */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </>
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
