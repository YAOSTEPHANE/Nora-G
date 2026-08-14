import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { Prescription } from '../db/types'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconFile } from '../ui/icons'

type Props = {
  canManage: boolean
  actor: { id: string; displayName: string }
}

type Filter = 'today' | 'all' | 'caisse'

function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function createdYmd(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function OrdonnancesView({ canManage, actor }: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const rows =
    useLiveQuery(
      () => db.prescriptions.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const [patientName, setPatientName] = useState('')
  const [phone, setPhone] = useState('')
  const [prescriberName, setPrescriberName] = useState('')
  const [prescriptionNumber, setPrescriptionNumber] = useState('')
  const [issuedAt, setIssuedAt] = useState(todayYmd())
  const [mutuelleName, setMutuelleName] = useState('')
  const [mutuellePct, setMutuellePct] = useState('')
  const [mutuelleAmount, setMutuelleAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('today')

  const today = todayYmd()
  const todayCount = useMemo(
    () =>
      rows.filter((r) => (r.issuedAt ?? createdYmd(r.createdAt)) === today)
        .length,
    [rows, today],
  )
  const mutuelleCount = rows.filter((r) => !!r.mutuelleName).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...rows]
      .filter((r) => {
        if (filter === 'today') {
          return (r.issuedAt ?? createdYmd(r.createdAt)) === today
        }
        if (filter === 'caisse') return !!r.saleId
        return true
      })
      .filter((r) => {
        if (!q) return true
        return (
          r.patientName.toLowerCase().includes(q) ||
          (r.patientPhone?.includes(q) ?? false) ||
          (r.prescriberName?.toLowerCase().includes(q) ?? false) ||
          (r.prescriptionNumber?.toLowerCase().includes(q) ?? false) ||
          (r.mutuelleName?.toLowerCase().includes(q) ?? false)
        )
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [rows, filter, search, today])

  const create = async () => {
    if (!canManage) return
    if (!patientName.trim()) {
      toast.error('Nom du patient requis')
      return
    }
    const pctRaw = mutuellePct.replace(',', '.').trim()
    const amtRaw = mutuelleAmount.replace(/\s/g, '').trim()
    let mutuelleCoveragePct: number | undefined
    let mutuelleAmountTTC: number | undefined
    if (pctRaw) {
      mutuelleCoveragePct = Number(pctRaw)
      if (
        !Number.isFinite(mutuelleCoveragePct) ||
        mutuelleCoveragePct < 0 ||
        mutuelleCoveragePct > 100
      ) {
        toast.error('Taux mutuelle invalide (0–100)')
        return
      }
    }
    if (amtRaw) {
      mutuelleAmountTTC = Math.round(Number(amtRaw))
      if (!Number.isFinite(mutuelleAmountTTC) || mutuelleAmountTTC < 0) {
        toast.error('Montant mutuelle invalide')
        return
      }
    }
    const row: Prescription = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      patientName: patientName.trim(),
      patientPhone: phone.trim() || undefined,
      prescriberName: prescriberName.trim() || undefined,
      prescriptionNumber: prescriptionNumber.trim() || undefined,
      issuedAt: issuedAt || today,
      notes: notes.trim() || undefined,
      mutuelleName: mutuelleName.trim() || undefined,
      mutuelleCoveragePct,
      mutuelleAmountTTC,
      createdAt: Date.now(),
      createdByProfileId: actor.id,
    }
    await db.prescriptions.add(row)
    setPatientName('')
    setPhone('')
    setPrescriberName('')
    setPrescriptionNumber('')
    setMutuelleName('')
    setMutuellePct('')
    setMutuelleAmount('')
    setNotes('')
    toast.success('Ordonnance enregistrée', row.patientName)
  }

  const remove = async (row: Prescription) => {
    if (!canManage || row.saleId) return
    await db.prescriptions.delete(row.id)
    toast.info('Ligne retirée', row.patientName)
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconFile />}
        eyebrow={`Magasin · ${activeStore?.name ?? '—'}`}
        title="Ordonnances"
        subtitle="Registre des délivrances pharmacie, mutuelle et saisie caisse"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label="Aujourd’hui" value={String(todayCount)} tone="accent" />
        <Kpi label="Mutuelle" value={String(mutuelleCount)} tone="violet" />
        <Kpi label="Total registre" value={String(rows.length)} tone="neutral" />
      </div>
      {canManage ? (
        <FormPanel
          eyebrow="Registre"
          title="Nouvelle délivrance"
          description="Patient, prescripteur, mutuelle et notes de caisse."
          actions={
            <Button variant="accent" onClick={() => void create()}>
              Ajouter au registre
            </Button>
          }
        >
          <FormGrid columns={3}>
            <Field label="Patient" required>
              <Input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </Field>
            <Field label="Téléphone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Date délivrance">
              <Input
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
              />
            </Field>
            <Field label="Prescripteur">
              <Input
                value={prescriberName}
                onChange={(e) => setPrescriberName(e.target.value)}
              />
            </Field>
            <Field label="N° ordonnance">
              <Input
                value={prescriptionNumber}
                onChange={(e) => setPrescriptionNumber(e.target.value)}
              />
            </Field>
            <Field label="Mutuelle">
              <Input
                value={mutuelleName}
                onChange={(e) => setMutuelleName(e.target.value)}
              />
            </Field>
            <Field label="Taux mutuelle %">
              <Input
                inputMode="decimal"
                value={mutuellePct}
                onChange={(e) => setMutuellePct(e.target.value)}
                className="font-mono-nums"
              />
            </Field>
            <Field label="Part mutuelle (FCFA)">
              <Input
                inputMode="numeric"
                value={mutuelleAmount}
                onChange={(e) => setMutuelleAmount(e.target.value)}
                className="font-mono-nums"
              />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
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
            { id: 'today', label: 'Aujourd’hui', count: todayCount },
            { id: 'caisse', label: 'Caisse' },
            { id: 'all', label: 'Tout', count: rows.length },
          ]}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Patient, n°, prescripteur…"
          className="sm:max-w-xs"
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="Aucune ordonnance"
          description="Les délivrances caisse et les saisies manuelles s’affichent ici."
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
            >
              <div>
                <p className="text-[13px] font-semibold">{r.patientName}</p>
                <p className="text-[11px] text-ink-muted">
                  {r.issuedAt ?? createdYmd(r.createdAt)}
                  {r.prescriberName ? ` · ${r.prescriberName}` : ''}
                  {r.prescriptionNumber ? ` · ${r.prescriptionNumber}` : ''}
                  {r.mutuelleName
                    ? ` · ${r.mutuelleName}${
                        r.mutuelleCoveragePct != null
                          ? ` ${r.mutuelleCoveragePct}%`
                          : ''
                      }${
                        r.mutuelleAmountTTC != null
                          ? ` ${formatFCFA(r.mutuelleAmountTTC)}`
                          : ''
                      }`
                    : ''}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.saleId ? 'success' : 'neutral'}>
                  {r.saleId ? 'Caisse' : 'Registre'}
                </Badge>
                {canManage && !r.saleId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(r)}
                  >
                    Supprimer
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
