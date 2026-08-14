import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { GiftCard } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconStar } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

function codeGen(): string {
  return `GC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export function CadeauxView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const cards =
    useLiveQuery(
      () => db.giftCards.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [amount, setAmount] = useState('10000')
  const [phone, setPhone] = useState('')
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemAmt, setRedeemAmt] = useState('')

  const active = useMemo(
    () => cards.filter((c) => c.status === 'active' && c.balanceTTC > 0),
    [cards],
  )
  const float = active.reduce((m, c) => m + c.balanceTTC, 0)

  const issue = async () => {
    if (!canManage) return
    const initialAmountTTC = Math.round(Number(amount))
    if (!Number.isFinite(initialAmountTTC) || initialAmountTTC <= 0) {
      toast.error('Montant invalide')
      return
    }
    const row: GiftCard = {
      id: crypto.randomUUID(),
      code: codeGen(),
      storeId: activeStoreId,
      initialAmountTTC,
      balanceTTC: initialAmountTTC,
      status: 'active',
      customerPhone: phone.trim() || undefined,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.giftCards.add(row)
    setPhone('')
    toast.success('Carte émise', row.code)
  }

  const redeem = async () => {
    if (!canManage) return
    const card = cards.find(
      (c) => c.code.toUpperCase() === redeemCode.trim().toUpperCase(),
    )
    if (!card || card.status !== 'active') {
      toast.error('Carte introuvable ou inactive')
      return
    }
    const pay = Math.round(Number(redeemAmt))
    if (!Number.isFinite(pay) || pay <= 0 || pay > card.balanceTTC) {
      toast.error('Montant invalide')
      return
    }
    const balanceTTC = card.balanceTTC - pay
    await db.giftCards.update(card.id, {
      balanceTTC,
      status: balanceTTC <= 0 ? 'redeemed' : 'active',
      updatedAt: Date.now(),
    })
    setRedeemCode('')
    setRedeemAmt('')
    toast.success('Utilisation enregistrée', formatFCFA(pay))
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconStar />}
        title="Cartes cadeaux"
        subtitle="Émission et utilisation des bons"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Kpi label="Cartes actives" value={String(active.length)} tone="accent" />
        <Kpi label="Encours cadeaux" value={formatFCFA(float)} tone="violet" />
      </div>
      {canManage ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <FormPanel
            eyebrow="Émission"
            title="Créer une carte cadeau"
            description="Montant et téléphone optionnel du bénéficiaire."
            actions={
              <Button variant="accent" onClick={() => void issue()}>
                Créer la carte
              </Button>
            }
          >
            <FormGrid columns={1}>
              <Field label="Montant (FCFA)">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Téléphone (opt.)">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </FormGrid>
          </FormPanel>
          <FormPanel
            eyebrow="Utilisation"
            title="Débiter une carte"
            description="Saisissez le code et le montant à consommer."
            actions={<Button onClick={() => void redeem()}>Débiter</Button>}
          >
            <FormGrid columns={1}>
              <Field label="Code">
                <Input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} />
              </Field>
              <Field label="Montant">
                <Input value={redeemAmt} onChange={(e) => setRedeemAmt(e.target.value)} />
              </Field>
            </FormGrid>
          </FormPanel>
        </div>
      ) : null}
      {cards.length === 0 ? (
        <EmptyState title="Aucune carte" description="Émettez un bon cadeau." />
      ) : (
        <ul className="space-y-2">
          {[...cards].sort((a, b) => b.createdAt - a.createdAt).map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="font-mono text-[13px] font-semibold">{c.code}</p>
                <p className="text-[11px] text-ink-muted">
                  Solde {formatFCFA(c.balanceTTC)} / {formatFCFA(c.initialAmountTTC)}
                </p>
              </div>
              <Badge tone={c.status === 'active' ? 'success' : 'neutral'}>
                {c.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
