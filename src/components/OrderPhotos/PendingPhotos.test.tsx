import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The Storage layer is stubbed so no real Firebase SDK is pulled in. New picks
// never touch it (they're local Files); only the `existing` strip (an edit's
// saved photos) resolves download URLs via getPhotoUrl.
const getPhotoUrl = vi.fn()
vi.mock('../../firebase/photos', () => ({
  uploadOrderPhoto: vi.fn(),
  getPhotoUrl: (...a: unknown[]) => getPhotoUrl(...a),
  deleteOrderPhoto: vi.fn(),
}))
vi.mock('../../observability/reportError', () => ({ reportError: vi.fn() }))

// Imported after the mock above is registered.
import PendingPhotos from './PendingPhotos'

const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
  getPhotoUrl.mockImplementation((path: string) => Promise.resolve(`https://cdn/${path}`))
  // jsdom has no object-URL support; the previews need it.
  globalThis.URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`)
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('PendingPhotos', () => {
  it('shows an add tile and no photos when the list is empty', () => {
    render(<PendingPhotos files={[]} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows ONE add tile whose click opens the file dialog directly on desktop', async () => {
    // The setup.ts matchMedia stub matches every query, so the tile sees a
    // hover+fine-pointer (desktop) device here.
    const user = userEvent.setup()
    const { container } = render(<PendingPhotos files={[]} onChange={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: 'Добавить фото' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Снять фото' })).not.toBeInTheDocument()

    const inputs = container.querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(2)
    // The gallery input comes FIRST (it's the one the upload tests reach) and has
    // NO `capture` — the plain photo library / file picker; only the dedicated
    // camera input forces capture.
    expect(inputs[0]).not.toHaveAttribute('capture')
    expect(inputs[1]).toHaveAttribute('capture', 'environment')

    // A desktop click goes straight to the gallery input — no chooser dialog.
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click')
    await user.click(screen.getByRole('button', { name: 'Добавить фото' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(inputClick).toHaveBeenCalledTimes(1)
    expect((inputClick.mock.instances[0] as HTMLInputElement).hasAttribute('capture')).toBe(false)
    inputClick.mockRestore()
  })

  it('opens a gallery/camera chooser on a touch device and routes to the picked input', async () => {
    // Report a NON-desktop device (no hover / coarse pointer) so the tile shows
    // the chooser dialog instead of jumping straight to the file dialog.
    const mql = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    )
    const user = userEvent.setup()
    render(<PendingPhotos files={[]} onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Добавить фото' }))
    const dialog = await screen.findByRole('dialog', { name: 'Добавить фото' })

    // Picking "camera" clicks the capture input and closes the chooser.
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click')
    expect(within(dialog).getByRole('button', { name: /Из галереи/ })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Снять фото/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(inputClick).toHaveBeenCalledTimes(1)
    expect((inputClick.mock.instances[0] as HTMLInputElement).getAttribute('capture')).toBe(
      'environment',
    )
    inputClick.mockRestore()
    mql.mockRestore()
  })

  it('reports a photo taken via the camera input through the same onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<PendingPhotos files={[]} onChange={onChange} />)
    const file = image('shot.jpg')
    const cameraInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement
    await user.upload(cameraInput, file)
    expect(onChange).toHaveBeenCalledWith([file])
  })

  it('reports picked files via onChange WITHOUT uploading anything', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<PendingPhotos files={[]} onChange={onChange} />)
    const file = image('rose.jpg')
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)
    expect(onChange).toHaveBeenCalledWith([file])
  })

  it('renders a thumbnail per file and opens the fullscreen viewer', async () => {
    const user = userEvent.setup()
    render(<PendingPhotos files={[image('a.jpg')]} onChange={vi.fn()} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Открыть фото' }))
    expect(await screen.findByRole('dialog', { name: 'Просмотр фото' })).toBeInTheDocument()
  })

  it('removes a photo via its delete control', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const a = image('a.jpg')
    const b = image('b.jpg')
    render(<PendingPhotos files={[a, b]} onChange={onChange} />)
    await user.click(screen.getAllByRole('button', { name: 'Удалить фото' })[0])
    expect(onChange).toHaveBeenCalledWith([b])
  })

  it('shows the saved photos (resolved thumbnails) before the new picks', async () => {
    render(
      <PendingPhotos
        files={[image('new.jpg')]}
        onChange={vi.fn()}
        existing={['orders/owner-1/o1/a.jpg']}
        onRemoveExisting={vi.fn()}
      />,
    )
    // Saved photo first (its resolved download URL), then the local preview.
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(screen.getAllByRole('img')[0]).toHaveAttribute(
      'src',
      'https://cdn/orders/owner-1/o1/a.jpg',
    )
  })

  it('confirms a saved-photo removal, then reports it up instead of deleting anything itself', async () => {
    const user = userEvent.setup()
    const onRemoveExisting = vi.fn()
    render(
      <PendingPhotos
        files={[]}
        onChange={vi.fn()}
        existing={['orders/owner-1/o1/a.jpg']}
        onRemoveExisting={onRemoveExisting}
      />,
    )
    // A SAVED photo's × is gated by a confirm (its endpoint is a permanent
    // Storage delete); dismissing the dialog keeps the photo untouched.
    await user.click(await screen.findByRole('button', { name: 'Удалить фото' }))
    const dismissed = await screen.findByRole('dialog', { name: 'Удалить фото?' })
    await user.click(within(dismissed).getByRole('button', { name: 'Отмена' }))
    expect(onRemoveExisting).not.toHaveBeenCalled()

    // Confirming only reports the path up — the parent form stages the removal
    // and the actual Storage delete happens on save, never here.
    await user.click(screen.getByRole('button', { name: 'Удалить фото' }))
    const confirmed = await screen.findByRole('dialog', { name: 'Удалить фото?' })
    await user.click(within(confirmed).getByRole('button', { name: 'Удалить' }))
    expect(onRemoveExisting).toHaveBeenCalledWith('orders/owner-1/o1/a.jpg')
  })

  it('ignores picking a file that is already in the strip (no duplicate uploads later)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const a = image('a.jpg')
    const b = image('b.jpg')
    const { container } = render(<PendingPhotos files={[a]} onChange={onChange} />)

    // Re-picking `a` (same name/size/lastModified) is dropped; `b` gets through.
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, [a, b])
    expect(onChange).toHaveBeenCalledWith([a, b])

    // A pick consisting ONLY of duplicates reports nothing at all.
    onChange.mockClear()
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, [a])
    expect(onChange).not.toHaveBeenCalled()
  })
})
