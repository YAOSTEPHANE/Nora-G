import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { listStaffProfiles, subscribeStaffProfiles } from '../auth/profiles'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { HrRequest, HrRequestStatus, HrRequestType, TimePunch } from '../db/types'
import { saleLocalYmd } from '../lib/salesStats'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader } from '../ui/Card'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { IconPersonnel } from '../ui/icons'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { MobileDataCard, ResponsiveData } from '../ui/ResponsiveData'
import { useToast } from '../ui/Toast'

type Props = {
  actor: { id: string; displayName: string }
  canReview: boolean
}

function statusLabel(s: HrRequestStatus): string {
  if (s === 'pending') return 'En attente'
  if (s === 'approved') return 'Approuvée'
  return 'Rejetée'
}

export function RhManagementView({ actor, canReview }: Props) {
  const nowTs = new Date().getTime()
  const { activeStoreId } = useActiveStore()
  const toast = useToast()
  const [staffProfileId, setStaffProfileId] = useState(actor.id)
  const [type, setType] = useState<HrRequestType>('leave')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [amountFCFA, setAmountFCFA] = useState('')
  const [reason, setReason] = useState('')
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null)
  const [pendingRejectUntil, setPendingRejectUntil] = useState(0)

  const [profiles, setProfiles] = useState(() => listStaffProfiles())
  useEffect(() => {
    return subscribeStaffProfiles(() => setProfiles(listStaffProfiles()))
  }, [])
  const punches = useLiveQuery(() => db.timePunches.orderBy('createdAt').reverse().limit(2000).toArray(), [], []) ?? []
  const requests = useLiveQuery(() => db.hrRequests.orderBy('createdAt').reverse().limit(300).toArray(), [], []) ?? []

  const kpis = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending').length
    const approved = requests.filter((r) => r.status === 'approved').length
    const absentToday = new Set<string>()
    const today = saleLocalYmd(nowTs)
    const byProfile = new Map<string, TimePunch[]>()
    for (const p of punches) {
      const arr = byProfile.get(p.profileId) ?? []
      arr.push(p)
      byProfile.set(p.profileId, arr)
    }
    for (const profile of profiles) {
      const rows = (byProfile.get(profile.id) ?? []).filter((x) => saleLocalYmd(x.createdAt) === today)
      if (rows.length === 0) absentToday.add(profile.id)
    }
    return { pending, approved, absentToday: absentToday.size }
  }, [requests, punches, profiles, nowTs])

  const createRequest = async (): Promise<void> => {
    if (!reason.trim()) {
      toast.error('Motif requis')
      return
    }
    const staff = profiles.find((p) => p.id === staffProfileId)
    if (!staff) {
      toast.error('Collaborateur invalide')
      return
    }
    const amount = Number.parseInt(amountFCFA.trim() || '0', 10)
    const rec: HrRequest = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      staffProfileId: staff.id,
      staffDisplayName: staff.displayName,
      storeId: activeStoreId,
      type,
      reason: reason.trim(),
      status: 'pending',
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      amountFCFA: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    }
    await db.hrRequests.add(rec)
    setReason('')
    setAmountFCFA('')
    toast.success('Demande RH créée')
  }

  const reviewRequest = async (
    id: string,
    status: Exclude<HrRequestStatus, 'pending'>,
  ): Promise<void> => {
    const now = new Date().getTime()
    if (status === 'rejected' && (pendingRejectId !== id || now > pendingRejectUntil)) {
      setPendingRejectId(id)
      setPendingRejectUntil(now + 7000)
      toast.warning(
        'Confirmer le rejet',
        'Cliquez encore sur "Rejeter" dans les 7 secondes.',
      )
      return
    }
    const reviewNote = undefined
    await db.hrRequests.update(id, {
      status,
      reviewedAt: new Date().getTime(),
      reviewedByProfileId: actor.id,
      reviewedByDisplayName: actor.displayName,
      reviewNote,
    })
    if (status === 'rejected') {
      setPendingRejectId(null)
      setPendingRejectUntil(0)
    }
    toast.success(status === 'approved' ? 'Demande approuvée' : 'Demande rejetée')
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconPersonnel />}
        eyebrow="Ressources humaines"
        title="RH"
        subtitle="Demandes et validations manager"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Demandes en attente" value={String(kpis.pending)} tone="amber" />
        <Kpi label="Demandes approuvées" value={String(kpis.approved)} tone="accent" />
        <Kpi label="Absents aujourd’hui" value={String(kpis.absentToday)} tone="neutral" />
      </div>

      <FormPanel
        eyebrow="Demande"
        title="Nouvelle demande"
        description="Congé, avance ou remboursement."
        actions={
          <Button variant="accent" onClick={() => void createRequest()}>
            Soumettre la demande
          </Button>
        }
      >
        <FormGrid columns={3}>
          <Field label="Collaborateur">
            <Select value={staffProfileId} onChange={(e) => setStaffProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type de demande">
            <Select value={type} onChange={(e) => setType(e.target.value as HrRequestType)}>
              <option value="leave">Congé</option>
              <option value="advance">Avance salaire</option>
              <option value="expense">Remboursement frais</option>
            </Select>
          </Field>
          <Field label="Montant FCFA (si applicable)">
            <Input inputMode="numeric" value={amountFCFA} onChange={(e) => setAmountFCFA(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Date début">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Date fin">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Motif" className="lg:col-span-3">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif de la demande..." />
          </Field>
        </FormGrid>
      </FormPanel>

      <Card>
        <CardHeader title="Suivi des demandes" subtitle="Validation manager et historique" />
        <CardContent>
          {requests.length === 0 ? (
            <EmptyState title="Aucune demande RH" variant="flat" />
          ) : (
            <ResponsiveData
              table={
                <Table minWidth={1040}>
                  <THead>
                    <Tr hover={false}>
                      <Th sticky>Date</Th>
                      <Th>Collaborateur</Th>
                      <Th hideBelow="lg">Type</Th>
                      <Th hideBelow="xl">Période</Th>
                      <Th align="right" hideBelow="lg">
                        Montant
                      </Th>
                      <Th>Statut</Th>
                      <Th hideBelow="xl">Commentaire manager</Th>
                      <Th align="right">Action</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {requests.map((r) => (
                      <Tr key={r.id}>
                        <Td sticky mono>
                          {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                        </Td>
                        <Td>{r.staffDisplayName}</Td>
                        <Td hideBelow="lg">{r.type}</Td>
                        <Td hideBelow="xl">
                          {r.startDate ?? '—'} {r.endDate ? `-> ${r.endDate}` : ''}
                        </Td>
                        <Td align="right" mono hideBelow="lg">
                          {r.amountFCFA ?? 0}
                        </Td>
                        <Td>{statusLabel(r.status)}</Td>
                        <Td
                          className="max-w-[220px] truncate"
                          title={r.reviewNote}
                          hideBelow="xl"
                        >
                          {r.reviewNote ?? '—'}
                        </Td>
                        <Td align="right">
                          {canReview && r.status === 'pending' ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void reviewRequest(r.id, 'approved')}
                              >
                                Approuver
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void reviewRequest(r.id, 'rejected')}
                              >
                                Rejeter
                              </Button>
                            </div>
                          ) : (
                            '—'
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <ul className="grid gap-2">
                  {requests.map((r) => (
                    <MobileDataCard
                      key={r.id}
                      title={r.staffDisplayName}
                      meta={`${new Date(r.createdAt).toLocaleDateString('fr-FR')} · ${r.type} · ${statusLabel(r.status)}`}
                      body={
                        <div className="space-y-1">
                          <p>
                            Période : {r.startDate ?? '—'}
                            {r.endDate ? ` → ${r.endDate}` : ''}
                          </p>
                          {r.amountFCFA ? (
                            <p className="font-mono-nums">Montant : {r.amountFCFA} FCFA</p>
                          ) : null}
                          {r.reviewNote ? <p>Note : {r.reviewNote}</p> : null}
                        </div>
                      }
                      actions={
                        canReview && r.status === 'pending' ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              fullWidth
                              onClick={() => void reviewRequest(r.id, 'approved')}
                            >
                              Approuver
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              fullWidth
                              onClick={() => void reviewRequest(r.id, 'rejected')}
                            >
                              Rejeter
                            </Button>
                          </>
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
