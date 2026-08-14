import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { JobSite, JobSiteStatus } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconWrench } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type Filter = 'active' | 'all' | 'done'

const NEXT: Record<JobSiteStatus, JobSiteStatus | null> = {
  open: 'in_progress',
  in_progress: 'done',
  done: 'invoiced',
  invoiced: null,
  cancelled: null,
}

const NEXT_LABEL: Record<JobSiteStatus, string> = {
  open: 'Démarrer',
  in_progress: 'Terminer',
  done: 'Facturer',
  invoiced: '',
  cancelled: '',
}

function statusLabel(s: JobSiteStatus): string {
  switch (s) {
    case 'open':
      return 'Ouvert'
    case 'in_progress':
      return 'En cours'
    case 'done':
      return 'Terminé'
    case 'invoiced':
      return 'Facturé'
    case 'cancelled':
      return 'Annulé'
    default: {
      const _e: never = s
      return _e
    }
  }
}

function statusTone(
  s: JobSiteStatus,
): 'warning' | 'accent' | 'success' | 'neutral' {
  switch (s) {
    case 'open':
      return 'warning'
    case 'in_progress':
      return 'accent'
    case 'done':
    case 'invoiced':
      return 'success'
    case 'cancelled':
      return 'neutral'
    default: {
      const _e: never = s
      return _e
    }
  }
}

export function ChantiersView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const sites =
    useLiveQuery(
      () => db.jobSites.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [budget, setBudget] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('active')

  const active = useMemo(
    () => sites.filter((s) => s.status === 'open' || s.status === 'in_progress'),
    [sites],
  )
  const invoicedSum = sites
    .filter((s) => s.status === 'invoiced')
    .reduce((m, s) => m + (s.budgetTTC ?? 0), 0)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...sites]
      .filter((s) => {
        if (filter === 'active') {
          return s.status === 'open' || s.status === 'in_progress'
        }
        if (filter === 'done') {
          return s.status === 'done' || s.status === 'invoiced'
        }
        return true
      })
      .filter((s) => {
        if (!q) return true
        return (
          s.name.toLowerCase().includes(q) ||
          s.clientName.toLowerCase().includes(q) ||
          (s.address?.toLowerCase().includes(q) ?? false) ||
          (s.clientPhone?.includes(q) ?? false)
        )
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [sites, filter, search])

  const create = async () => {
    if (!canManage) return
    if (!name.trim() || !clientName.trim()) {
      toast.error('Chantier et client requis')
      return
    }
    let budgetTTC: number | undefined
    const raw = budget.replace(/\s/g, '').trim()
    if (raw) {
      budgetTTC = Math.round(Number(raw))
      if (!Number.isFinite(budgetTTC) || budgetTTC < 0) {
        toast.error('Budget invalide')
        return
      }
    }
    const row: JobSite = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      status: 'open',
      name: name.trim(),
      clientName: clientName.trim(),
      clientPhone: phone.trim() || undefined,
      address: address.trim() || undefined,
      budgetTTC,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.jobSites.add(row)
    setName('')
    setClientName('')
    setPhone('')
    setAddress('')
    setBudget('')
    setNotes('')
    toast.success('Chantier créé', row.name)
  }

  const advance = async (site: JobSite) => {
    if (!canManage) return
    const next = NEXT[site.status]
    if (!next) return
    await db.jobSites.update(site.id, { status: next, updatedAt: Date.now() })
    toast.info('Chantier', statusLabel(next))
  }

  const cancel = async (site: JobSite) => {
    if (!canManage) return
    await db.jobSites.update(site.id, {
      status: 'cancelled',
      updatedAt: Date.now(),
    })
    toast.info('Chantier annulé', site.name)
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconWrench />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Chantiers"
        subtitle="Suivi des chantiers BTP, clients et facturation"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="En cours" value={String(active.length)} tone="amber" />
        <Kpi label="Chantiers" value={String(sites.length)} tone="neutral" />
        <Kpi label="Facturé" value={formatFCFA(invoicedSum)} tone="violet" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="BTP"
          title="Nouveau chantier"
          description="Client, adresse, budget et notes de suivi."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Créer le chantier
            </Button>
          }
        >
          <FormGrid>
            <Field label="Nom du chantier" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Client" required>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Adresse">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="Budget (FCFA)">
              <Input
                inputMode="numeric"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="font-mono-nums"
              />
            </Field>
            <Field label="Notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[44px]"
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          variant="segmented"
          active={filter}
          onChange={setFilter}
          items={[
            { id: 'active', label: 'En cours', count: active.length },
            { id: 'done', label: 'Terminés' },
            { id: 'all', label: 'Tous', count: sites.length },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Chantier, client, adresse…"
          className="sm:max-w-xs"
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="Aucun chantier"
          description="Suivez les chantiers et leur avancement."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">{s.name}</p>
                <p className="text-[11px] text-ink-muted">
                  {s.clientName}
                  {s.clientPhone ? ` · ${s.clientPhone}` : ''}
                  {s.address ? ` · ${s.address}` : ''}
                  {s.budgetTTC != null ? ` · ${formatFCFA(s.budgetTTC)}` : ''}
                  {s.notes ? ` · ${s.notes}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
                {canManage && NEXT[s.status] ? (
                  <Button size="sm" onClick={() => void advance(s)}>
                    {NEXT_LABEL[s.status]}
                  </Button>
                ) : null}
                {canManage &&
                s.status !== 'cancelled' &&
                s.status !== 'invoiced' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void cancel(s)}
                  >
                    Annuler
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
