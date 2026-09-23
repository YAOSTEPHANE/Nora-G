import { useState } from 'react'
import { verifyManagerOverrideSecret } from '../lib/managerOverride'
import { Button } from '../ui/Button'
import { FormAlert, FormActions, FormSection, FormSwitchRow } from '../ui/Form'
import { Field, Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Switch } from '../ui/Switch'

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
    <Modal open onClose={onCancel} title={title} subtitle={subtitle} size="sm">
      <form onSubmit={submit} className="ui-form">
        <FormSection title="Authentification" columns={1}>
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
          <FormSwitchRow label="Afficher le secret">
            <Switch
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
            />
          </FormSwitchRow>
        </FormSection>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <FormActions className="mt-4">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" variant="accent">
            {confirmLabel}
          </Button>
        </FormActions>
      </form>
    </Modal>
  )
}
