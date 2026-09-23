import { useCallback, useMemo, useState } from 'react'
import type { Sale } from '../db/types'
import { formatFCFA } from '../lib/money'
import {
  computeRefundFromLineQty,
  lineRefundAmountTTC,
  refundableQty,
  saleNetTTC,
  saleFullyRefunded,
} from '../lib/refundMath'
import type { LineRefundQtyMap } from '../lib/refundMath'
import { applySaleRefund } from '../lib/refundApply'
import { Button } from '../ui/Button'
import { FormSection } from '../ui/Form'
import { Field, Input, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'

type Props = {
  sale: Sale
  actor: { profileId: string; displayName: string }
  onClose: () => void
  onDone: () => void
}

export function RefundSaleModal({ sale, actor, onClose, onDone }: Props) {
  const toast = useToast()
  const [qtyByProduct, setQtyByProduct] = useState<LineRefundQtyMap>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingConfirmUntil, setPendingConfirmUntil] = useState(0)

  const initFullRefund = useCallback(() => {
    const next: LineRefundQtyMap = {}
    for (const line of sale.lines) {
      const max = refundableQty(line, sale)
      if (max > 0) next[line.productId] = max
    }
    setQtyByProduct(next)
  }, [sale])

  const preview = useMemo(
    () => computeRefundFromLineQty(sale, qtyByProduct),
    [sale, qtyByProduct],
  )
  const netAfter = preview.ok
    ? Math.max(0, saleNetTTC(sale) - preview.amountTTC)
    : saleNetTTC(sale)

  const submit = useCallback(async () => {
    const r = reason.trim()
    if (r.length < 3) {
      toast.error('Motif requis', 'Au moins 3 caractères.')
      return
    }
    const computed = computeRefundFromLineQty(sale, qtyByProduct)
    if (!computed.ok) {
      toast.error('Remboursement invalide', computed.message)
      return
    }
    const now = new Date().getTime()
    if (now > pendingConfirmUntil) {
      setPendingConfirmUntil(now + 7000)
      toast.warning(
        'Confirmer le remboursement',
        `Cliquez encore sur "Valider" pour ${formatFCFA(computed.amountTTC)} (7s).`,
      )
      return
    }
    setBusy(true)
    try {
      await applySaleRefund({
        saleId: sale.id,
        lineQty: qtyByProduct,
        reason: r,
        actor: {
          profileId: actor.profileId,
          displayName: actor.displayName,
        },
      })
      toast.success(
        'Remboursement enregistré',
        formatFCFA(computed.amountTTC),
      )
      setPendingConfirmUntil(0)
      onDone()
      onClose()
    } catch (e) {
      toast.error(
        'Échec du remboursement',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setBusy(false)
    }
  }, [actor, onClose, onDone, pendingConfirmUntil, qtyByProduct, reason, sale, toast])

  if (saleFullyRefunded(sale)) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Remboursement"
        footer={
          <Button variant="primary" onClick={onClose}>
            Fermer
          </Button>
        }
      >
        <p className="text-[13px] text-zinc-700">
          Cette vente est entièrement remboursée.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Remboursement"
      subtitle={`Ticket ${sale.id.slice(0, 8).toUpperCase()} · Net ${formatFCFA(saleNetTTC(sale))}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!preview.ok}
            onClick={() => void submit()}
          >
            Valider {preview.ok ? `(${formatFCFA(preview.amountTTC)})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormSection
          title="Lignes à rembourser"
          description="Indiquez la quantité à rembourser pour chaque article."
          columns={1}
        >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={initFullRefund}>
            Tout rembourser
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setQtyByProduct({})}
          >
            Réinitialiser
          </Button>
        </div>

        <ul className="space-y-2">
          {sale.lines.map((line) => {
            const max = refundableQty(line, sale)
            const q = Math.floor(qtyByProduct[line.productId] ?? 0)
            const previewLine =
              q > 0 ? lineRefundAmountTTC(line, q, sale.discountPct) : 0
            return (
              <li
                key={line.productId}
                className="rounded-[10px] border border-border/80 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{line.name}</span>
                  <span className="text-[11px] text-ink-subtle">
                    vendu {line.qty} · max {max}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    value={qtyByProduct[line.productId] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setQtyByProduct((prev) => ({
                        ...prev,
                        [line.productId]:
                          v === ''
                            ? 0
                            : Math.min(
                                max,
                                Math.max(0, Number.parseInt(v, 10) || 0),
                              ),
                      }))
                    }}
                    className="w-24 font-mono-nums"
                  />
                  {previewLine > 0 ? (
                    <span className="font-mono-nums text-[12px] font-semibold text-amber-700">
                      → {formatFCFA(previewLine)}
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        </FormSection>

        <FormSection title="Motif" columns={1}>
        <Field label="Motif (obligatoire)" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ex. produit défectueux, erreur de caisse, demande client…"
          />
        </Field>

        <div className="rounded-[10px] border border-border/70 bg-caisse-ivory p-3 text-[12px]">
          <p className="text-ink-muted">
            Montant remboursement :{' '}
            <span className="font-mono-nums font-bold text-ink">
              {preview.ok ? formatFCFA(preview.amountTTC) : '—'}
            </span>
          </p>
          {preview.ok ? (
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              Net ticket après : {formatFCFA(netAfter)}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-amber-700">
              {preview.message}
            </p>
          )}
        </div>
        </FormSection>
      </div>
    </Modal>
  )
}
