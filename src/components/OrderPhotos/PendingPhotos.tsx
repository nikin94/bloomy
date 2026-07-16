import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AddPhotoTile from './AddPhotoTile'
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal'
import PhotoViewer from './PhotoViewer'
import Thumb from './Thumb'
import { usePhotoUrls } from './usePhotoUrls'

// Identity of a picked file, for de-duplication: the same file picked twice
// (double-tap on a phone, re-picking from the gallery) must not become two
// Storage uploads. name+size+lastModified is the strongest identity the File
// API offers without reading the bytes.
const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

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
  // Path of the SAVED photo whose × was pressed, awaiting confirmation. Only
  // saved photos are gated: their file is eventually deleted from Storage (on
  // save), so the removal deserves the same confirm the detail page used to
  // show. A newly picked file is local-only — removing it costs nothing, so
  // its × stays instant.
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)

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
    // Drop files already in the strip (and duplicates within one pick).
    const known = new Set(files.map(fileKey))
    const fresh = Array.from(picked).filter((file) => {
      if (known.has(fileKey(file))) return false
      known.add(fileKey(file))
      return true
    })
    if (fresh.length > 0) onChange([...files, ...fresh])
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
            alt={`${t('photos.alt')} ${index + 1}`}
            t={t}
            onOpen={() => setViewerIndex(index)}
            onDelete={onRemoveExisting ? () => setConfirmingRemove(path) : undefined}
          />
        ))}
        {previews.map((url, index) => (
          <Thumb
            key={url}
            url={url}
            alt={`${t('photos.alt')} ${existing.length + index + 1}`}
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

      {/* Confirm before dropping a SAVED photo from the strip. The removal is
          still only STAGED (applied on save, reversible until then), but its
          endpoint is a permanent Storage delete — same confirm the detail-page
          gallery used to show for the same action. */}
      {confirmingRemove !== null && (
        <ConfirmModal
          title={t('photos.deleteTitle')}
          body={t('photos.deleteBody')}
          confirmLabel={t('common:delete')}
          cancelLabel={t('common:cancel')}
          onConfirm={() => {
            onRemoveExisting?.(confirmingRemove)
            setConfirmingRemove(null)
          }}
          onCancel={() => setConfirmingRemove(null)}
        />
      )}
    </section>
  )
}

export default PendingPhotos
