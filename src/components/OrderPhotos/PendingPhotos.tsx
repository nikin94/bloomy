import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AddPhotoTile from './AddPhotoTile'
import PhotoViewer from './PhotoViewer'
import Thumb from './Thumb'
import { usePhotoUrls } from './usePhotoUrls'

// Stable fallback so callers that pass no `existing` list (the create form)
// don't hand the URL resolver a fresh [] every render.
const NO_EXISTING: string[] = []

// Photo picker for the order FORM (create and edit). Two sources render as one
// strip:
//  • `existing` — Storage paths already saved on the edited order (empty on
//    create), shown as resolved thumbnails. The × only reports the removal up
//    via `onRemoveExisting` — the parent form STAGES it, and the actual
//    Storage/doc delete happens on save, so cancelling the form leaves every
//    saved photo untouched.
//  • `files` — newly picked File objects, shown as object-URL previews and
//    uploaded once, on submit (see OrderForm.handleSubmit) — abandoning the
//    form uploads nothing and leaves no orphaned blobs.
// Reuses the detail gallery's Thumb + fullscreen PhotoViewer so both look identical.
const PendingPhotos = ({
  files,
  onChange,
  existing = NO_EXISTING,
  onRemoveExisting,
}: {
  files: File[]
  onChange: (files: File[]) => void
  // Saved photos of the order being edited (absent on create).
  existing?: string[]
  onRemoveExisting?: (path: string) => void
}) => {
  const { t } = useTranslation(['order', 'common'])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // Download URLs for the saved photos, resolved lazily (no-op on create).
  const existingUrls = usePhotoUrls(existing)
  // One object-URL preview per file, rebuilt when the list changes and revoked on
  // cleanup so blob URLs never leak. The list is small (a handful of photos), so
  // recomputing the whole set on each add/remove is cheap.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  // The viewer swipes over the whole strip: saved photos first, then new picks.
  const viewerUrls = [...existing.map((path) => existingUrls[path]), ...previews]

  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    onChange([...files, ...Array.from(picked)])
  }
  const removeAt = (index: number) => onChange(files.filter((_, i) => i !== index))

  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-semibold text-heading">{t('photos.title')}</h2>

      <div className="flex flex-wrap gap-3">
        {existing.map((path, index) => (
          <Thumb
            key={path}
            url={existingUrls[path]}
            t={t}
            onOpen={() => setViewerIndex(index)}
            onDelete={onRemoveExisting ? () => onRemoveExisting(path) : undefined}
          />
        ))}
        {previews.map((url, index) => (
          <Thumb
            key={url}
            url={url}
            t={t}
            onOpen={() => setViewerIndex(existing.length + index)}
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
          urls={viewerUrls}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </section>
  )
}

export default PendingPhotos
