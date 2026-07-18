import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

const onClose = vi.fn()

const renderModal = (children = <button>Внутри</button>) =>
  render(
    <Modal title="Заголовок" onClose={onClose}>
      {children}
    </Modal>,
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Modal', () => {
  it('renders a labelled dialog with the title and its children', () => {
    renderModal(<p>Тело</p>)
    expect(screen.getByRole('dialog', { name: 'Заголовок' })).toBeInTheDocument()
    expect(screen.getByText('Тело')).toBeInTheDocument()
  })

  it('closes via the close button', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the dialog on open and traps Tab at both ends', async () => {
    const user = userEvent.setup()
    renderModal(<button>Внутри</button>)
    const close = screen.getByRole('button', { name: 'Закрыть' })
    const inner = screen.getByRole('button', { name: 'Внутри' })
    // The first focusable (the close button) receives focus on open.
    expect(close).toHaveFocus()

    // Tab from the last focusable wraps to the first, and Shift+Tab wraps back.
    inner.focus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(inner).toHaveFocus()
  })

  it('caps the panel to the viewport and scrolls the body when content is tall', () => {
    renderModal(<p>Тело</p>)
    // The panel is height-capped so a tall dialog (e.g. the order filter on a
    // short phone) never overflows the screen…
    const panel = screen.getByRole('dialog').querySelector('.max-h-full')
    expect(panel).not.toBeNull()
    // …and the body sits in its own scroll region (min-h-0 so overflow engages
    // inside the capped flex column) while the header stays fixed.
    const body = panel!.querySelector('.overflow-y-auto')
    expect(body).not.toBeNull()
    expect(body).toHaveClass('min-h-0')
    expect(body).toHaveTextContent('Тело')
  })

  it('restores focus to the opener when it unmounts', async () => {
    const user = userEvent.setup()
    const Harness = () => {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Открыть</button>
          {open && (
            <Modal title="Заголовок" onClose={() => setOpen(false)}>
              <button>Внутри</button>
            </Modal>
          )}
        </>
      )
    }
    render(<Harness />)

    const opener = screen.getByRole('button', { name: 'Открыть' })
    opener.focus()
    await user.click(opener)
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(opener).toHaveFocus()
  })
})

describe('Modal body scroll lock', () => {
  it('locks page scroll while mounted and restores the previous value on close', () => {
    // A pre-existing inline overflow must be RESTORED, not blanked — otherwise
    // unmount order across nested dialogs could strand the page unscrollable.
    document.body.style.overflow = 'scroll'
    const { unmount } = render(
      <Modal title="Заголовок" onClose={() => {}}>
        <p>Тело</p>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })
})
