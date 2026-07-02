import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// PendingPhotos reuses Thumb/PhotoViewer from OrderPhotos, whose module imports the
// Storage layer at load time — stub it so no real Firebase SDK is pulled in. The
// component itself never calls these (it's local-only), so plain vi.fn()s suffice.
vi.mock('../../firebase/photos', () => ({
  uploadOrderPhoto: vi.fn(),
  getPhotoUrl: vi.fn(),
  deleteOrderPhoto: vi.fn(),
}))

// Imported after the mock above is registered.
import PendingPhotos from './PendingPhotos'

const image = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  vi.clearAllMocks()
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
})
