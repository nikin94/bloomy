import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PhotoViewer from './PhotoViewer'
import Thumb from './Thumb'
import { usePhotoUrls } from './usePhotoUrls'

// VIEW-ONLY photo gallery for the order detail page: a strip of resolved
// thumbnails plus the full-screen swiper. Managing photos (adding/removing)
// happens on the EDIT form — the one place an order is changed — so this page
// never writes to Storage or the order doc (see PendingPhotos for the editable
// picker). Hidden entirely when the order has no photos, so there is never an
// empty "Photos" heading.
const OrderPhotos = ({ photos }: { photos: string[] }) => {
  const { t } = useTranslation(['order', 'common'])
  const urls = usePhotoUrls(photos)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  if (photos.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-semibold text-heading">{t('photos.title')}</h2>

      <div className="flex flex-wrap gap-3">
        {photos.map((path, index) => (
          <Thumb key={path} url={urls[path]} t={t} onOpen={() => setViewerIndex(index)} />
        ))}
      </div>

      {viewerIndex !== null && (
        <PhotoViewer
          urls={photos.map((p) => urls[p])}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </section>
  )
}

export default OrderPhotos
