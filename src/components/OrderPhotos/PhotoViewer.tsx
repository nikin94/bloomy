import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Loader from '@/components/Loader/Loader'
import ViewerChevron from '@/components/icons/ViewerChevron'

// Full-screen swiper. A horizontal scroll-snap track of full images; Esc closes,
// arrows step. `pointer-events` stay on the controls so a tap on the backdrop
// (outside an image) closes it.
const PhotoViewer = ({
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

export default PhotoViewer
