import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { Quote, QuoteStatus, SaleLine } from '../db/types'
import { DEFAULT_VAT_RATE_PCT, formatFCFA, totalsFromLinesTTC } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconReceipt } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
  onLoadToCart?: (lines: SaleLine[], meta: { quoteId: string; customerName: string; customerPhone?: string }) => void
}

function statusLabel(s: QuoteStatus): string {
  switch (s) {
    case 'draft':
      return 'Brouillon'
    case 'sent':
      return 'Envoyé'
    case 'accepted':
      return 'Accepté'
    case 'rejected':
      return 'Refusé'
    case 'expired':
      return 'Expiré'
    case 'converted':
      return 'Converti'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: QuoteStatus,
): 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'accent' {
  switch (s) {
    case 'draft':
      return 'neutral'
    case 'sent':
      return 'info'
    case 'accepted':
      return 'success'
    case 'rejected':
      return 'danger'
    case 'expired':
      return 'warning'
    case 'converted':
      return 'accent'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function nextQuoteRef(): string {
  return `DEV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`
}

export function DevisView({ canManage, actor, onLoadToCart }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore, displayProducts } = useActiveStore()
  const quotes =
    useLiveQuery(
      () =>
        db.quotes.where('storeId').equals(activeStoreId).reverse().sortBy('createdAt'),
      [activeStoreId],
      [],
    ) ?? []

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('1')
  const [lines, setLines] = useState<SaleLine[]>([])
  const [notes, setNotes] = useState('')
  const [validDays, setValidDays] = useState('15')
  const [busy, setBusy] = useState(false)

  const openCount = useMemo(
    () =>
      quotes.filter((q) =>
        q.status === 'draft' || q.status === 'sent' || q.status === 'accepted',
      ).length,
    [quotes],
  )

  const addLine = () => {
    const p = displayProducts.find((x) => x.id === productId)
    const q = Number.parseFloat(qty.replace(',', '.'))
    if (!p) return toast.error('Article', 'Choisissez un produit.')
    if (!Number.isFinite(q) || q <= 0) return toast.error('Quantité invalide', '')
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, qty: l.qty + q } : l,
        )
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unitPriceTTC: p.priceTTC,
          qty: q,
          vatRatePct: p.vatRatePct ?? DEFAULT_VAT_RATE_PCT,
        },
      ]
    })
    setQty('1')
  }

  const saveQuote = async (status: 'draft' | 'sent') => {
    if (!canManage) return
    if (!customerName.trim()) {
      return toast.error('Client requis', 'Indiquez le nom du client.')
    }
    if (lines.length === 0) {
      return toast.error('Lignes vides', 'Ajoutez au moins un article.')
    }
    setBusy(true)
    try {
      const totals = totalsFromLinesTTC(lines, 0)
      const days = Number.parseInt(validDays, 10)
      const now = Date.now()
      const quote: Quote = {
        id: crypto.randomUUID(),
        reference: nextQuoteRef(),
        storeId: activeStoreId,
        storeName: activeStore?.name,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        status,
        lines,
        subtotalHT: totals.subtotalHT,
        tva: totals.tva,
        totalTTC: totals.totalTTC,
        notes: notes.trim() || undefined,
        validUntil:
          Number.isFinite(days) && days > 0
            ? now + days * 24 * 60 * 60 * 1000
            : undefined,
        createdAt: now,
        updatedAt: now,
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
      }
      await db.quotes.add(quote)
      setLines([])
      setCustomerName('')
      setCustomerPhone('')
      setNotes('')
      toast.success(
        status === 'sent' ? 'Devis envoyé' : 'Devis enregistré',
        quote.reference,
      )
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (q: Quote, status: QuoteStatus) => {
    await db.quotes.update(q.id, { status, updatedAt: Date.now() })
    toast.info('Statut mis à jour', statusLabel(status))
  }

  const convertToCart = async (q: Quote) => {
    if (!onLoadToCart) {
      toast.info(
        'Conversion',
        'Ouvrez la caisse puis rechargez ce devis depuis le module Devis.',
      )
      return
    }
    onLoadToCart(q.lines, {
      quoteId: q.id,
      customerName: q.customerName,
      customerPhone: q.customerPhone,
    })
    await db.quotes.update(q.id, {
      status: 'converted',
      updatedAt: Date.now(),
    })
    toast.success('Devis chargé en caisse', q.reference)
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconReceipt />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Devis"
        subtitle="Propositions commerciales, validité et conversion en vente"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Devis ouverts" value={String(openCount)} tone="amber" />
        <Kpi label="Total devis" value={String(quotes.length)} />
        <Kpi
          label="CA devis acceptés"
          value={formatFCFA(
            quotes
              .filter((q) => q.status === 'accepted' || q.status === 'converted')
              .reduce((s, q) => s + q.totalTTC, 0),
          )}
          tone="accent"
        />
      </div>

      {canManage ? (
        <Card>
          <CardContent className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Nouveau devis</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Client" required>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </Field>
              <Field label="Téléphone">
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </Field>
              <Field label="Validité (jours)">
                <Input
                  inputMode="numeric"
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value)}
                />
              </Field>
              <Field label="Article">
                <Select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {displayProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatFCFA(p.priceTTC)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Qté" className="w-28">
                <Input
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </Field>
              <Button size="sm" variant="secondary" onClick={addLine}>
                Ajouter
              </Button>
            </div>
            {lines.length > 0 ? (
              <ul className="space-y-1 text-[12px]">
                {lines.map((l) => (
                  <li key={l.productId} className="flex justify-between">
                    <span>
                      {l.name} × {l.qty}
                    </span>
                    <span className="font-mono-nums">
                      {formatFCFA(l.unitPriceTTC * l.qty)}
                    </span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-border pt-1 font-semibold">
                  <span>Total TTC</span>
                  <span className="font-mono-nums">
                    {formatFCFA(totalsFromLinesTTC(lines, 0).totalTTC)}
                  </span>
                </li>
              </ul>
            ) : null}
            <Field label="Notes">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={busy}
                onClick={() => void saveQuote('draft')}
              >
                Brouillon
              </Button>
              <Button
                variant="accent"
                loading={busy}
                onClick={() => void saveQuote('sent')}
              >
                Enregistrer / Envoyer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {quotes.length === 0 ? (
        <EmptyState
          title="Aucun devis"
          description="Créez un devis pour un chantier, une installation ou une vente B2B."
        />
      ) : (
        <ul className="space-y-3">
          {[...quotes].reverse().map((q) => (
            <li key={q.id} className="rounded-xl border border-border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">
                    {q.reference} · {q.customerName}
                  </p>
                  <p className="text-[11px] text-ink-subtle">
                    {new Date(q.createdAt).toLocaleString('fr-FR')} ·{' '}
                    {formatFCFA(q.totalTTC)}
                    {q.validUntil
                      ? ` · valable jusqu’au ${new Date(q.validUntil).toLocaleDateString('fr-FR')}`
                      : ''}
                  </p>
                </div>
                <Badge tone={statusTone(q.status)}>{statusLabel(q.status)}</Badge>
              </div>
              <ul className="mt-2 space-y-0.5 text-[12px] text-ink-muted">
                {q.lines.map((l) => (
                  <li key={`${q.id}-${l.productId}`}>
                    {l.name} × {l.qty} · {formatFCFA(l.unitPriceTTC)}
                  </li>
                ))}
              </ul>
              {canManage && q.status !== 'converted' && q.status !== 'rejected' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {q.status === 'draft' || q.status === 'sent' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void setStatus(q, 'accepted')}
                    >
                      Marquer accepté
                    </Button>
                  ) : null}
                  {(q.status === 'accepted' || q.status === 'sent') && onLoadToCart ? (
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={() => void convertToCart(q)}
                    >
                      Charger en caisse
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void setStatus(q, 'rejected')}
                  >
                    Refuser
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
