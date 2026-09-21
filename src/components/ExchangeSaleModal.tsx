import { useCallback, useMemo, useState } from 'react'
import type { Product, Sale } from '../db/types'
import { formatFCFA } from '../lib/money'
import { applySaleExchangeReturn } from '../lib/refundApply'
import {
  computeRefundFromLineQty,
  lineRefundAmountTTC,
  refundableQty,
  saleFullyRefunded,
  saleNetTTC,
  type LineRefundQtyMap,
} from '../lib/refundMath'
import { productIsActive } from '../lib/productFilters'
import { Button } from '../ui/Button'
import { Field, Input, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'

export type ExchangeCartLine = {
  productId: string
  name: string
  unitPriceTTC: number
  qty: number
  vatRatePct?: number
}

type Props = {
  sale: Sale
  products: Product[]
  actor: { profileId: string; displayName: string }
  onClose: () => void
  onDone: (exchangeLines: ExchangeCartLine[]) => void
}

export function ExchangeSaleModal({
  sale,
  products,
  actor,
  onClose,
  onDone,
}: Props) {
  const toast = useToast()
  const [qtyByProduct, setQtyByProduct] = useState<LineRefundQtyMap>({})
  const [reason, setReason] = useState('Échange client')
  const [search, setSearch] = useState('')
  const [exchangeLines, setExchangeLines] = useState<ExchangeCartLine[]>([])
  const [busy, setBusy] = useState(false)

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return activeProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [activeProducts, search])

  const preview = useMemo(
    () => computeRefundFromLineQty(sale, qtyByProduct),
    [sale, qtyByProduct],
  )

  const exchangeTotal = useMemo(
    () =>
      exchangeLines.reduce(
        (s, l) => s + Math.round(l.unitPriceTTC * l.qty),
        0,
      ),
    [exchangeLines],
  )

  const returnedAmount = preview.ok ? preview.amountTTC : 0
  const balance = exchangeTotal - returnedAmount

  const addExchange = useCallback((p: Product) => {
    setExchangeLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id)
      if (i >= 0) {
        const next = [...prev]
        const cur = next[i]!
        next[i] = { ...cur, qty: cur.qty + 1 }
        return next
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unitPriceTTC: p.priceTTC,
          qty: 1,
          vatRatePct: p.vatRatePct,
        },
      ]
    })
    setSearch('')
  }, [])

  const submit = useCallback(async () => {
    const r = reason.trim()
    if (r.length < 3) {
      toast.error('Motif requis', 'Au moins 3 caractères.')
      return
    }
    const computed = computeRefundFromLineQty(sale, qtyByProduct)
    if (!computed.ok) {
      toast.error('Retour invalide', computed.message)
      return
    }
    if (exchangeLines.length === 0) {
      toast.error(
        'Contrepartie requise',
        'Ajoutez au moins un article de remplacement.',
      )
      return
    }
    setBusy(true)
    try {
      await applySaleExchangeReturn({
        saleId: sale.id,
        lineQty: qtyByProduct,
        reason: r,
        actor: {
          profileId: actor.profileId,
          displayName: actor.displayName,
        },
        exchangeProductIds: exchangeLines.map((l) => l.productId),
      })
      toast.success(
        'Échange enregistré',
        `Retour ${formatFCFA(computed.amountTTC)} · panier contrepartie prêt`,
      )
      onDone(exchangeLines)
      onClose()
    } catch (e) {
      toast.error(
        'Échec de l’échange',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setBusy(false)
    }
  }, [
    actor,
    exchangeLines,
    onClose,
    onDone,
    qtyByProduct,
    reason,
    sale,
    toast,
  ])

  if (saleFullyRefunded(sale)) {
    return (
      <Modal open onClose={onClose} title="Échange impossible" size="sm">
        <p className="text-[13px] text-zinc-600">
          Cette vente n’a plus de lignes remboursables.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Échange ticket" size="lg">
      <div className="space-y-4">
        <p className="text-[13px] text-zinc-600">
          Solde vente : {formatFCFA(saleNetTTC(sale))}. Sélectionnez les
          articles à restituer, puis la contrepartie à encaisser.
        </p>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Articles retournés
          </p>
          <ul className="max-h-44 space-y-2 overflow-y-auto">
            {sale.lines.map((line) => {
              const max = refundableQty(line, sale)
              if (max <= 0) return null
              const q = qtyByProduct[line.productId] ?? 0
              return (
                <li
                  key={line.productId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{line.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      Max {max} ·{' '}
                      {formatFCFA(
                        lineRefundAmountTTC(line, Math.max(q, 1), sale.discountPct),
                      )}{' '}
                      / u. net
                    </p>
                  </div>
                  <Input
                    className="w-20 text-center"
                    inputMode="numeric"
                    value={q ? String(q) : ''}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10)
                      setQtyByProduct((prev) => {
                        const next = { ...prev }
                        if (!Number.isFinite(n) || n <= 0) {
                          delete next[line.productId]
                        } else {
                          next[line.productId] = Math.min(max, n)
                        }
                        return next
                      })
                    }}
                  />
                </li>
              )
            })}
          </ul>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Contrepartie (nouvel article)
          </p>
          <Field label="Recherche">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom ou code-barres"
            />
          </Field>
          {searchHits.length > 0 ? (
            <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-zinc-200">
              {searchHits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-zinc-50"
                    onClick={() => addExchange(p)}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="font-mono-nums shrink-0 text-zinc-600">
                      {formatFCFA(p.priceTTC)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {exchangeLines.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {exchangeLines.map((l) => (
                <li
                  key={l.productId}
                  className="flex items-center justify-between gap-2 text-[13px]"
                >
                  <span className="truncate">
                    {l.name} × {l.qty}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-nums">
                      {formatFCFA(Math.round(l.unitPriceTTC * l.qty))}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExchangeLines((prev) =>
                          prev.filter((x) => x.productId !== l.productId),
                        )
                      }
                    >
                      Retirer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="rounded-lg border border-[rgba(0,51,170,0.2)] bg-[#f7f8fc] px-3 py-2 text-[12px]">
          <p>
            Retour :{' '}
            <strong className="font-mono-nums">
              {formatFCFA(returnedAmount)}
            </strong>
          </p>
          <p>
            Contrepartie :{' '}
            <strong className="font-mono-nums">
              {formatFCFA(exchangeTotal)}
            </strong>
          </p>
          <p className="mt-1 font-medium text-caisse-gold">
            {balance > 0
              ? `Client doit ${formatFCFA(balance)} (à encaisser en caisse)`
              : balance < 0
                ? `À rembourser ${formatFCFA(-balance)} (déjà créditée via retour)`
                : 'Échange équilibré — validez la contrepartie en caisse (0 FCFA)'}
          </p>
        </div>

        <Field label="Motif" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void submit()}>
            Valider l’échange
          </Button>
        </div>
      </div>
    </Modal>
  )
}
