import { useState } from 'react'
import type { OnlineOrder, OnlineOrderMessage } from '../db/types'
import { Button } from '../ui/Button'
import { FormSection } from '../ui/Form'
import { Field, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'

type Props = {
  order: OnlineOrder
  history: OnlineOrderMessage[]
  busy: boolean
  onClose: () => void
  onSave: (payload: {
    customerMessage?: string
    internalMessage?: string
  }) => Promise<void>
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function OnlineOrderMessageModal(props: Props) {
  return <OnlineOrderMessageModalContent key={props.order.id} {...props} />
}

function OnlineOrderMessageModalContent({
  order,
  history,
  busy,
  onClose,
  onSave,
}: Props) {
  const [customerMessage, setCustomerMessage] = useState(order.customerMessage ?? '')
  const [internalMessage, setInternalMessage] = useState(order.internalMessage ?? '')

  return (
    <Modal
      open
      onClose={onClose}
      title="Messagerie commande"
      subtitle={`Réf. ${order.id.slice(0, 8).toUpperCase()} · ${order.customerName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="accent"
            loading={busy}
            onClick={() =>
              void onSave({
                customerMessage: customerMessage.trim() || undefined,
                internalMessage: internalMessage.trim() || undefined,
              })
            }
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormSection title="Messages" columns={1}>
          <Field
            label="Message client"
            hint="Visible pour le client (SMS / WhatsApp / canal externe)"
          >
            <Textarea
              rows={4}
              value={customerMessage}
              onChange={(e) => setCustomerMessage(e.target.value)}
              placeholder="Ex. Bonjour, votre commande est en préparation et sera prête à 12h40."
            />
          </Field>
          <Field
            label="Note interne équipe"
            hint="Visible uniquement par le staff"
          >
            <Textarea
              rows={4}
              value={internalMessage}
              onChange={(e) => setInternalMessage(e.target.value)}
              placeholder="Ex. Priorité élevée, client VIP, livrer sans piment."
            />
          </Field>
        </FormSection>
        {order.messageUpdatedAt ? (
          <p className="rounded-[10px] border border-border/60 bg-caisse-ivory px-2.5 py-2 text-[11px] text-ink-muted">
            Dernière mise à jour : {formatDateTime(order.messageUpdatedAt)}
            {order.messageUpdatedByDisplayName
              ? ` · ${order.messageUpdatedByDisplayName}`
              : ''}
          </p>
        ) : null}
        {history.length > 0 ? (
          <FormSection title="Historique" columns={1}>
            <ul className="space-y-1.5">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-[10px] border border-border/70 bg-white px-2.5 py-1.5 text-[11px] text-ink-muted"
                >
                  <p className="font-semibold text-ink">
                    {formatDateTime(entry.createdAt)} · {entry.authorDisplayName}
                  </p>
                  {entry.customerMessage ? (
                    <p>
                      <span className="text-zinc-500">Client:</span>{' '}
                      {entry.customerMessage}
                    </p>
                  ) : null}
                  {entry.internalMessage ? (
                    <p>
                      <span className="text-zinc-500">Interne:</span>{' '}
                      {entry.internalMessage}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </FormSection>
        ) : null}
      </div>
    </Modal>
  )
}
