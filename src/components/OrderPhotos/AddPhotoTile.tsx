import { useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import Button from '@/components/Button/Button'
import Modal from '@/components/Modal/Modal'
import CameraIcon from '@/components/icons/CameraIcon'
import GalleryIcon from '@/components/icons/GalleryIcon'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { FOCUS_RING } from '@/styles/fieldStyles'

// The single "add photo" tile shared by the detail gallery (OrderPhotos) and the
// create form's local picker (PendingPhotos). ONE visible tile; where the click
// goes depends on the device:
//
//  - Desktop (hover + fine pointer): straight to the file dialog — the OS picker
//    is the whole flow there, a chooser dialog would be a pointless extra step.
//  - Touch devices: our own chooser dialog with two options. A phone can't be
//    served by one input: without `capture` Android's photo picker often offers
//    no camera, and with it some mobile browsers jump to the camera with no
//    gallery option — so the choice has to be made BEFORE the native UI opens.
//
// Two hidden inputs back the options: the gallery one has NO `capture` (native
// picker → photo library / files), the camera one carries `capture="environment"`
// (opens the rear camera directly). Both funnel into the caller's `onFiles`; the
// tile owns resetting the input values so picking the same file twice still fires.
const AddPhotoTile = ({
  onFiles,
  t,
}: {
  // Receives the picked FileList; the caller decides what "adding" means
  // (upload now on the detail page, hold locally on the create form).
  onFiles: (files: FileList | null) => void
  // Passed from the parent (single i18next subscription), as Thumb does.
  t: TFunction<['order', 'common']>
}) => {
  // Hover + fine pointer = a desktop-class device where the file dialog covers
  // everything; anything else (touch) gets the explicit gallery/camera chooser.
  const isDesktop = useMediaQuery('(hover: hover) and (pointer: fine)')
  const [choosing, setChoosing] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handlePick = (files: FileList | null) => {
    onFiles(files)
    // Reset so picking the same file again still fires onChange.
    if (galleryInputRef.current) galleryInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  // The inputs live OUTSIDE the modal, so closing it never unmounts the input
  // whose native dialog was just opened.
  const openGallery = () => {
    setChoosing(false)
    galleryInputRef.current?.click()
  }
  const openCamera = () => {
    setChoosing(false)
    cameraInputRef.current?.click()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (isDesktop ? galleryInputRef.current?.click() : setChoosing(true))}
        aria-label={t('photos.add')}
        className={`flex size-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text hover:bg-primary-bg ${FOCUS_RING}`}
      >
        <GalleryIcon />
      </button>

      {/* The gallery input has NO `capture`, so a phone opens its photo
          library / file picker; `multiple` allows several at once. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handlePick(e.target.files)}
      />
      {/* The camera input's `capture="environment"` opens the rear camera
          directly on a phone (a desktop browser ignores it — plain file dialog). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handlePick(e.target.files)}
      />

      {choosing && (
        <Modal title={t('photos.add')} onClose={() => setChoosing(false)} widthClassName="max-w-xs">
          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={openGallery} className="justify-start gap-3">
              <GalleryIcon />
              {t('photos.fromGallery')}
            </Button>
            <Button variant="secondary" onClick={openCamera} className="justify-start gap-3">
              <CameraIcon />
              {t('photos.capture')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

export default AddPhotoTile
