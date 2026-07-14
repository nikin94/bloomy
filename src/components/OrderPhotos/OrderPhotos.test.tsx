import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The storage layer is mocked so the component never touches Firebase. We test
// the gallery UI: resolving thumbnails, uploading, deleting (with confirm), and
// opening the full-screen viewer.
const getPhotoUrl = vi.fn()
const uploadOrderPhoto = vi.fn()
const deleteOrderPhoto = vi.fn()
vi.mock('../../firebase/photos', () => ({
  getPhotoUrl: (...a: unknown[]) => getPhotoUrl(...a),
  uploadOrderPhoto: (...a: unknown[]) => uploadOrderPhoto(...a),
  deleteOrderPhoto: (...a: unknown[]) => deleteOrderPhoto(...a),
}))
vi.mock('../../observability/reportError', () => ({ reportError: vi.fn() }))

import OrderPhotos from './OrderPhotos'

const fileInput = (): HTMLInputElement =>
  document.querySelector('input[type="file"]') as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  getPhotoUrl.mockImplementation((path: string) => Promise.resolve(`https://cdn/${path}`))
})

const renderGallery = (photos: string[], onChange = vi.fn()) => {
  render(<OrderPhotos ownerId="owner-1" orderId="o1" photos={photos} onChange={onChange} />)
  return onChange
}

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
    // thumbnail stuck on its loader. Gating on a mount-lifetime flag fixes it.
    render(
      <StrictMode>
        <OrderPhotos
          ownerId="owner-1"
          orderId="o1"
          photos={['orders/owner-1/o1/a.jpg', 'orders/owner-1/o1/b.jpg']}
          onChange={vi.fn()}
        />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://cdn/orders/owner-1/o1/a.jpg')
  })

  it('shows ONE add tile backed by a capture-less gallery input and a capture camera input', () => {
    renderGallery([])
    // A single visible tile (the mobile chooser dialog is covered by the shared
    // AddPhotoTile's tests in PendingPhotos.test); the setup.ts matchMedia stub
    // reports desktop here, so its click goes straight to the file dialog.
    expect(screen.getAllByRole('button', { name: 'Добавить фото' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Снять фото' })).not.toBeInTheDocument()
    const inputs = document.querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(2)
    // The gallery input comes FIRST (it's the one fileInput() reaches) and has
    // NO `capture`; only the dedicated camera input forces capture.
    expect(inputs[0]).not.toHaveAttribute('capture')
    expect(inputs[1]).toHaveAttribute('capture', 'environment')
  })

  it('uploads a picked file and reports the new full photo list', async () => {
    const user = userEvent.setup()
    uploadOrderPhoto.mockResolvedValue('orders/owner-1/o1/new.jpg')
    const onChange = renderGallery(['orders/owner-1/o1/a.jpg'])

    const file = new File(['x'], 'snap.jpg', { type: 'image/jpeg' })
    await user.upload(fileInput(), file)

    await waitFor(() => expect(uploadOrderPhoto).toHaveBeenCalledWith('owner-1', 'o1', file))
    expect(onChange).toHaveBeenCalledWith(['orders/owner-1/o1/a.jpg', 'orders/owner-1/o1/new.jpg'])
  })

  it('surfaces an error and keeps the list unchanged when an upload fails (offline)', async () => {
    const user = userEvent.setup()
    uploadOrderPhoto.mockRejectedValue(new Error('offline'))
    const onChange = renderGallery([])

    await user.upload(fileInput(), new File(['x'], 'snap.jpg', { type: 'image/jpeg' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Не удалось загрузить/i)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps photos that uploaded when one of several files fails', async () => {
    const user = userEvent.setup()
    uploadOrderPhoto
      .mockResolvedValueOnce('orders/owner-1/o1/ok.jpg')
      .mockRejectedValueOnce(new Error('offline'))
    const onChange = renderGallery([])

    await user.upload(fileInput(), [
      new File(['x'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['y'], 'two.jpg', { type: 'image/jpeg' }),
    ])

    // The succeeded upload is persisted (no orphan blob), the error still shows.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['orders/owner-1/o1/ok.jpg']))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Не удалось загрузить/i)
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

  it('deletes a photo only after confirming, dropping it from the list', async () => {
    const user = userEvent.setup()
    deleteOrderPhoto.mockResolvedValue(undefined)
    const onChange = renderGallery(['orders/owner-1/o1/a.jpg', 'orders/owner-1/o1/b.jpg'])
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))

    await user.click(screen.getAllByRole('button', { name: 'Удалить фото' })[0])
    // A confirm dialog gates the destructive delete.
    const dialog = await screen.findByRole('dialog', { name: 'Удалить фото?' })
    expect(deleteOrderPhoto).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    expect(onChange).toHaveBeenCalledWith(['orders/owner-1/o1/b.jpg'])
    await waitFor(() => expect(deleteOrderPhoto).toHaveBeenCalledWith('orders/owner-1/o1/a.jpg'))
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
    getPhotoUrl.mockResolvedValue('https://cdn/a.jpg')
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
    getPhotoUrl.mockResolvedValue('https://cdn/a.jpg')
    renderGallery(['orders/owner-1/o1/a.jpg'])
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Открыть фото' }))
    const dialog = await screen.findByRole('dialog', { name: 'Просмотр фото' })

    // …but clicking the photo (which stops propagation) does not close it.
    await user.click(within(dialog).getByRole('img'))
    expect(screen.getByRole('dialog', { name: 'Просмотр фото' })).toBeInTheDocument()
  })
})
