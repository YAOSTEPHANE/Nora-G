import { useCallback, useState } from 'react'
import type { Sale } from '../db/types'
import { formatFCFA } from '../lib/money'
import { applySaleVoid } from '../lib/refundApply'
import { saleFullyRefunded, saleNetTTC } from '../lib/refundMath'
import { ManagerOverrideModal } from './ManagerOverrideModal'
import { Button } from '../ui/Button'
import { FormSection } from '../ui/Form'
import { Field, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'

type Props = {
  sale: Sale
  actor: { profileId: string; displayName: string }
  /** Au-delà de ce délai (ms), PIN gérant obligatoire. */
  recentWindowMs?: number
  onClose: () => void
  onDone: () => void
}

export function VoidSaleModal({
  sale,
  actor,
  recentWindowMs = 30 * 60 * 1000,
  onClose,
  onDone,
}: Props) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingConfirmUntil, setPendingConfirmUntil] = useState(0)
  const [needManager, setNeedManager] = useState(false)
  const [authorizedBy, setAuthorizedBy] = useState<{
    profileId: string
    displayName: string
  } | null>(null)

  const ageMs = Date.now() - sale.createdAt
  const requiresManager = ageMs > recentWindowMs

  const runVoid = useCallback(
    async (manager?: { profileId: string; displayName: string }) => {
      const r = reason.trim()
      if (r.length < 3) {
        toast.error('Motif requis', 'Au moins 3 caractères.')
        return
      }
      const now = Date.now()
      if (now > pendingConfirmUntil) {
        setPendingConfirmUntil(now + 7000)
        toast.warning(
          'Confirmer l’annulation',
          `Cliquez encore sur « Annuler la vente » pour ${formatFCFA(saleNetTTC(sale))} (7s).`,
        )
        return
      }
      setBusy(true)
      try {
        const result = await applySaleVoid({
          saleId: sale.id,
          reason: r,
          actor: {
            profileId: actor.profileId,
            displayName: actor.displayName,
          },
          authorizedBy: manager ?? authorizedBy ?? undefined,
        })
        toast.success('Vente annulée', formatFCFA(result.amountTTC))
        onDone()
        onClose()
      } catch (e) {
        toast.error(
          'Échec de l’annulation',
          e instanceof Error ? e.message : String(e),
        )
      } finally {
        setBusy(false)
      }
    },
    [
      actor,
      authorizedBy,
      onClose,
      onDone,
      pendingConfirmUntil,
      reason,
      sale,
      toast,
    ],
  )

  if (saleFullyRefunded(sale)) {
    return (
      <Modal open onClose={onClose} title="Annulation impossible" size="sm">
        <p className="text-[13px] text-zinc-600">
          Cette vente est déjà intégralement remboursée / annulée.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </Modal>
    )
  }

  if (needManager) {
    return (
      <ManagerOverrideModal
        title="Validation gérant — annulation"
        subtitle={`Cette vente a plus de ${Math.round(recentWindowMs / 60000)} min. PIN gérant requis pour annuler ${formatFCFA(saleNetTTC(sale))}.`}
        confirmLabel="Autoriser l’annulation"
        onCancel={() => setNeedManager(false)}
        onVerified={(m) => {
          setAuthorizedBy({
            profileId: m.profileId,
            displayName: m.displayName,
          })
          setNeedManager(false)
          void runVoid({
            profileId: m.profileId,
            displayName: m.displayName,
          })
        }}
      />
    )
  }

  return (
    <Modal open onClose={onClose} title="Annuler la vente" size="md">
      <div className="space-y-3">
        <FormSection
          title="Récapitulatif"
          description={
            requiresManager
              ? 'Validation gérant requise (vente hors fenêtre récente). Double confirmation ensuite.'
              : 'Restitution stock + remboursement intégral. Double confirmation requise.'
          }
          columns={1}
        >
        <p className="text-[12px] text-ink-muted">
          Solde net à annuler :{' '}
          <span className="font-mono-nums font-semibold text-ink">
            {formatFCFA(saleNetTTC(sale))}
          </span>
        </p>
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[10px] border border-border/70 bg-caisse-ivory p-2 text-[12px]">
          {sale.lines.map((l) => (
            <li key={l.productId} className="flex justify-between gap-2">
              <span className="truncate text-ink">
                {l.name} × {l.qty}
              </span>
              <span className="font-mono-nums shrink-0 text-ink-muted">
                {formatFCFA(Math.round(l.unitPriceTTC * l.qty))}
              </span>
            </li>
          ))}
        </ul>
        </FormSection>
        <FormSection title="Motif" columns={1}>
        <Field label="Motif" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Erreur encaissement, client, doublon…"
          />
        </Field>
        </FormSection>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              if (requiresManager && !authorizedBy) {
                setNeedManager(true)
                return
              }
              void runVoid()
            }}
          >
            Annuler la vente
          </Button>
        </div>
      </div>
    </Modal>
  )
}
