import { useState } from 'react'
import Input from '../Input/Input'
import Textarea from '../Textarea/Textarea'
import Button from '../Button/Button'
import type { CustomerEdits } from '../../firebase/customers'

interface CustomerFormProps {
  // Prefill values (editing an existing customer). Omit for a blank form.
  initial?: CustomerEdits
  // Persist the edited fields. Throwing surfaces the message inline and keeps
  // the form open so the user can retry.
  onSubmit: (edits: CustomerEdits) => Promise<void>
  // Leave the form without saving.
  onCancel: () => void
}

// Compact, reusable form for a customer's editable fields (name required; phone,
// address and note optional). Owns its own input state and name validation; the
// caller decides how the result is persisted (see CustomerFormProps). Used for
// inline editing on the customers page.
const CustomerForm = ({ initial, onSubmit, onCancel }: CustomerFormProps) => {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  // Hidden until the first submit attempt so the form doesn't nag while typing.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameMissing = submitAttempted && name.trim() === ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSubmitAttempted(true)
    if (name.trim() === '') return

    setSaving(true)
    setError(null)
    try {
      await onSubmit({ name, phone, address, note })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить клиента')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 flex-col gap-2">
      <Input
        className="w-full"
        aria-label="Имя клиента"
        placeholder="Имя*"
        invalid={nameMissing}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        className="w-full"
        aria-label="Телефон"
        placeholder="Телефон"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Input
        className="w-full"
        aria-label="Адрес"
        placeholder="Адрес"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <Textarea
        className="min-h-16 w-full"
        aria-label="Заметка о клиенте"
        placeholder="Заметка"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
      </div>
    </form>
  )
}

export default CustomerForm
