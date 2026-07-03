import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PhotoViewer from './PhotoViewer'
import Thumb from './Thumb'
import CameraIcon from '../icons/CameraIcon'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // One object-URL preview per file, rebuilt when the list changes and revoked on
  // cleanup so blob URLs never leak. The list is small (a handful of photos), so
  // recomputing the whole set on each add/remove is cheap.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    onChange([...files, ...Array.from(picked)])
    // Reset so picking the same file again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = ''
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

        {/* Add tile — opens the device camera or gallery (mobile) / file picker. No
            loading state here: nothing uploads until the order is saved. */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('photos.add')}
          className="flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text hover:bg-primary-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <CameraIcon />
        </button>
      </div>

      {/* `capture="environment"` hints the rear camera on mobile but still lets the
          user pick from the gallery; `multiple` allows several at once. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
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
