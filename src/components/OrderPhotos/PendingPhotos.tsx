import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AddPhotoTile from './AddPhotoTile'
import PhotoViewer from './PhotoViewer'
import Thumb from './Thumb'

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

  // One object-URL preview per file, rebuilt when the list changes and revoked on
  // cleanup so blob URLs never leak. The list is small (a handful of photos), so
  // recomputing the whole set on each add/remove is cheap.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    onChange([...files, ...Array.from(picked)])
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

        {/* One add tile. Desktop opens the file dialog directly; a touch device
            gets a gallery/camera chooser first — see AddPhotoTile. No loading
            state here: nothing uploads until the order is saved. */}
        <AddPhotoTile onFiles={addFiles} t={t} />
      </div>

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
