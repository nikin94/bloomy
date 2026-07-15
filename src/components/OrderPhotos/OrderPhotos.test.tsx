import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The storage layer is mocked so the component never touches Firebase. We test
// the VIEW-ONLY gallery UI: resolving thumbnails and the full-screen viewer.
// Adding/removing photos lives on the edit form now — see PendingPhotos.test.
const getPhotoUrl = vi.fn()
vi.mock('../../firebase/photos', () => ({
  getPhotoUrl: (...a: unknown[]) => getPhotoUrl(...a),
  uploadOrderPhoto: vi.fn(),
  deleteOrderPhoto: vi.fn(),
}))
vi.mock('../../observability/reportError', () => ({ reportError: vi.fn() }))

import OrderPhotos from './OrderPhotos'

beforeEach(() => {
  vi.clearAllMocks()
  getPhotoUrl.mockImplementation((path: string) => Promise.resolve(`https://cdn/${path}`))
})

const renderGallery = (photos: string[]) => render(<OrderPhotos photos={photos} />)

describe('OrderPhotos', () => {
  it('resolves and shows a thumbnail for each stored photo path', async () => {
    renderGallery(['orders/owner-1/o1/a.jpg', 'orders/owner-1/o1/b.jpg'])

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://cdn/orders/owner-1/o1/a.jpg')
  })

  it('resolves thumbnails when mounted with existing photos under StrictMode', async () => {
    // Regression: re-entering an order with already-uploaded photos mounts the
    // gallery with `photos` ALREADY present. StrictMode runs the resolve effect
    // setup→cleanup→setup; the `requestedRef` (a ref) survives the re-run, so a
    // per-run `active` flag would have discarded the first run's resolved URL
    // while the second run skipped the already-requested path — leaving every
    // thumbnail stuck on its loader. Gating on a mount-lifetime flag fixes it
    // (the logic now lives in usePhotoUrls, shared with PendingPhotos).
    render(
      <StrictMode>
        <OrderPhotos photos={['orders/owner-1/o1/a.jpg', 'orders/owner-1/o1/b.jpg']} />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://cdn/orders/owner-1/o1/a.jpg')
  })

  it('renders nothing at all when the order has no photos', () => {
    renderGallery([])
    // No empty "Фото" heading and no add tile — the page is view-only.
    expect(screen.queryByRole('heading', { name: 'Фото' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('is view-only: no add tile and no per-thumb delete', async () => {
    renderGallery(['orders/owner-1/o1/a.jpg'])
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Добавить фото' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).not.toBeInTheDocument()
  })

  it('opens the viewer at the clicked index even while a thumbnail is still loading', async () => {
    const user = userEvent.setup()
    // First photo's URL never resolves; the second does. The viewer must still
    // open the second photo (index stays aligned with the full photo list).
    getPhotoUrl.mockImplementation((path: string) =>
      path.endsWith('b.jpg') ? Promise.resolve(`https://cdn/${path}`) : new Promise(() => {}),
    )
    renderGallery(['orders/owner-1/o1/a.jpg', 'orders/owner-1/o1/b.jpg'])

    const openButtons = await screen.findAllByRole('button', { name: 'Открыть фото' })
    await user.click(openButtons[1])

    const dialog = await screen.findByRole('dialog', { name: 'Просмотр фото' })
    await waitFor(() =>
      expect(within(dialog).getByRole('img')).toHaveAttribute(
        'src',
        'https://cdn/orders/owner-1/o1/b.jpg',
      ),
    )
  })

  it('opens the full-screen viewer when a thumbnail is clicked', async () => {
    const user = userEvent.setup()
    renderGallery(['orders/owner-1/o1/a.jpg'])
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Открыть фото' }))

    expect(await screen.findByRole('dialog', { name: 'Просмотр фото' })).toBeInTheDocument()
  })

  it('closes the viewer when the backdrop (area around the photo) is clicked', async () => {
    const user = userEvent.setup()
    renderGallery(['orders/owner-1/o1/a.jpg'])
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Открыть фото' }))
    const dialog = await screen.findByRole('dialog', { name: 'Просмотр фото' })

    // Tapping the dialog backdrop (not the photo) dismisses the viewer…
    await user.click(dialog)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Просмотр фото' })).not.toBeInTheDocument(),
    )
  })

  it('keeps the viewer open when the photo itself is clicked', async () => {
    const user = userEvent.setup()
    renderGallery(['orders/owner-1/o1/a.jpg'])
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Открыть фото' }))
    const dialog = await screen.findByRole('dialog', { name: 'Просмотр фото' })

    // …but clicking the photo (which stops propagation) does not close it.
    await user.click(within(dialog).getByRole('img'))
    expect(screen.getByRole('dialog', { name: 'Просмотр фото' })).toBeInTheDocument()
  })
})
