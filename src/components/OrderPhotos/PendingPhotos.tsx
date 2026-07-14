import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PhotoViewer from './PhotoViewer'
import Thumb from './Thumb'
import CameraIcon from '@/components/icons/CameraIcon'
import GalleryIcon from '@/components/icons/GalleryIcon'
import { FOCUS_RING } from '@/styles/fieldStyles'

// Local (deferred-upload) photo picker for the CREATE order form. Unlike OrderPhotos
// (the detail page), this NEVER touches Storage: the picked File objects live in the
// parent form and are shown as object-URL previews. The actual upload happens once,
// on order submit — so abandoning the form (cancel, tab close, refresh) uploads
// nothing and leaves no orphaned blobs to clean up. Reuses the detail gallery's
// Thumb + fullscreen PhotoViewer so both look identical.
const PendingPhotos = ({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) => {
  const { t } = useTranslation(['order', 'common'])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  // Two hidden inputs behind the two add tiles: the gallery one has NO `capture`
  // (native picker → photo library / files), the camera one carries
  // `capture="environment"` (opens the rear camera directly on a phone).
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // One object-URL preview per file, rebuilt when the list changes and revoked on
  // cleanup so blob URLs never leak. The list is small (a handful of photos), so
  // recomputing the whole set on each add/remove is cheap.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    onChange([...files, ...Array.from(picked)])
    // Reset so picking the same file again still fires onChange.
    if (galleryInputRef.current) galleryInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }
  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index))

  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-semibold text-heading">{t('photos.title')}</h2>

      <div className="flex flex-wrap gap-3">
        {previews.map((url, index) => (
          <Thumb
            key={url}
            url={url}
            t={t}
            onOpen={() => setViewerIndex(index)}
            onDelete={() => removeAt(index)}
          />
        ))}

        {/* Two add tiles — the icons say which flow each opens. GALLERY (picture
            glyph): the native picker, i.e. the phone photo library / desktop file
            dialog. CAMERA (camera glyph): straight to the device camera. One
            capture-less tile can't cover both — with `capture` set some mobile
            browsers jump to the camera with no gallery option, and without it
            Android's photo picker often offers no camera. No loading state here:
            nothing uploads until the order is saved. */}
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
      </div>

      {/* The gallery input has NO `capture`, so a phone opens its photo library /
          file picker; `multiple` allows several at once. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      {/* The camera input's `capture="environment"` opens the rear camera
          directly on a phone (a desktop browser ignores it — plain file dialog). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {viewerIndex !== null && (
        <PhotoViewer
          urls={previews}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </section>
  )
}

export default PendingPhotos
