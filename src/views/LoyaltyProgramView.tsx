import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { IconStar, IconUser } from '../ui/icons'
import { useToast } from '../ui/Toast'

type Props = {
  canManageLoyalty: boolean
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function LoyaltyProgramView({ canManageLoyalty }: Props) {
  const toast = useToast()
  const customers =
    useLiveQuery(() => db.loyaltyCustomers.orderBy('updatedAt').reverse().toArray(), [], []) ??
    []
  const txs =
    useLiveQuery(
      () => db.loyaltyTransactions.orderBy('createdAt').reverse().limit(50).toArray(),
      [],
      [],
    ) ?? []

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [adjustPoints, setAdjustPoints] = useState('')
  const [busy, setBusy] = useState(false)

  const visibleCustomers = useMemo(
    () => customers.filter((c) => !c.archived),
    [customers],
  )

  const stats = useMemo(() => {
    return visibleCustomers.reduce(
      (acc, c) => {
        acc.totalCustomers += 1
        acc.totalPoints += c.points
        return acc
      },
      { totalCustomers: 0, totalPoints: 0 },
    )
  }, [visibleCustomers])

  const archiveCustomer = async (id: string, archived: boolean) => {
    const row = customers.find((c) => c.id === id)
    if (!row) return
    await db.loyaltyCustomers.put({
      ...row,
      archived,
      updatedAt: Date.now(),
    })
    toast.success(archived ? 'Client archivé' : 'Client réactivé', row.phone)
  }

  const handleAdjust = async (): Promise<void> => {
    const p = normalizePhone(phone)
    const delta = Number.parseInt(adjustPoints.trim(), 10)
    if (!p) {
      toast.error('Téléphone requis')
      return
    }
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error('Points invalides', 'Entrez une valeur non nulle.')
      return
    }
    setBusy(true)
    try {
      const existing = customers.find((c) => c.phone === p)
      const id = existing?.id ?? crypto.randomUUID()
      const nextPoints = Math.max(0, (existing?.points ?? 0) + delta)
      const now = Date.now()
      await db.loyaltyCustomers.put({
        id,
        phone: p,
        displayName: name.trim() || existing?.displayName,
        points: nextPoints,
        totalSpentTTC: existing?.totalSpentTTC ?? 0,
        visitCount: existing?.visitCount ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        archived: existing?.archived,
      })
      await db.loyaltyTransactions.add({
        id: crypto.randomUUID(),
        customerId: id,
        createdAt: now,
        type: 'adjustment',
        points: delta,
        note: 'Ajustement manuel',
      })
      setAdjustPoints('')
      toast.success('Solde fidélité mis à jour')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconStar />}
        eyebrow="CRM"
        title="Fidélité"
        subtitle="Gestion des clients, points cumulés et historique des mouvements"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi
          label="Clients inscrits"
          value={String(stats.totalCustomers)}
          tone="accent"
          icon={<IconUser />}
        />
        <Kpi
          label="Points en circulation"
          value={String(stats.totalPoints)}
          tone="violet"
          icon={<IconStar />}
        />
      </div>

      {canManageLoyalty ? (
        <Card>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
              <Field label="Téléphone" required>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Nom client (optionnel)">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Ajustement points (+/-)" required>
                <Input
                  inputMode="numeric"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(e.target.value)}
                />
              </Field>
              <Button loading={busy} variant="accent" onClick={() => void handleAdjust()}>
                Valider
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {visibleCustomers.length === 0 ? (
        <EmptyState
          title="Aucun client fidélité"
          description="Les clients apparaîtront ici après la première vente fidélisée."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleCustomers.slice(0, 24).map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-1">
                <p className="font-mono text-[13px] font-semibold text-zinc-900">{c.phone}</p>
                <p className="text-[12px] text-zinc-600">{c.displayName ?? 'Client'}</p>
                <p className="text-[12px] text-zinc-700">
                  <strong>{c.points}</strong> points
                </p>
                <p className="text-[11px] text-zinc-500">Visites: {c.visitCount}</p>
                {canManageLoyalty ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void archiveCustomer(c.id, true)}
                  >
                    Archiver
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-2">
          <h2 className="text-[14px] font-semibold text-zinc-900">Dernières opérations</h2>
          {txs.length === 0 ? (
            <p className="text-[12px] text-zinc-500">Aucune opération pour le moment.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {txs.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-2 py-2 text-[12px]">
                  <span className="text-zinc-700">{tx.type}</span>
                  <span className="font-mono-nums text-zinc-900">{tx.points}</span>
                  <span className="font-mono-nums text-[11px] text-zinc-500">
                    {new Date(tx.createdAt).toLocaleString('fr-FR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
