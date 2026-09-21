import { useState } from 'react'
import { verifyManagerOverrideSecret } from '../lib/managerOverride'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

type Props = {
  title?: string
  subtitle: string
  confirmLabel?: string
  onCancel: () => void
  onVerified: (manager: {
    profileId: string
    displayName: string
    role: string
  }) => void
}

export function ManagerOverrideModal({
  title = 'Validation gérant',
  subtitle,
  confirmLabel = 'Autoriser',
  onCancel,
  onVerified,
}: Props) {
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const result = verifyManagerOverrideSecret(secret)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onVerified({
      profileId: result.profileId,
      displayName: result.displayName,
      role: result.role,
    })
  }

  return (
    <Modal open onClose={onCancel} title={title} size="sm">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[13px] text-zinc-600">{subtitle}</p>
        <Field label="PIN ou mot de passe gérant / admin" required>
          <Input
            type={show ? 'text' : 'password'}
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value)
              setError(null)
            }}
            autoFocus
            required
          />
        </Field>
        <label className="flex items-center gap-2 text-[12px] text-zinc-600">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
          />
          Afficher le secret
        </label>
        {error ? (
          <p className="text-[12px] font-medium text-rose-600">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" variant="accent">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
