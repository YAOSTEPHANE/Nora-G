import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listStaffProfiles,
  subscribeStaffProfiles,
} from '../auth/profiles'
import type { StaffProfile } from '../auth/types'
import { db } from '../db/db'
import type { TimePunch, TimePunchKind } from '../db/types'
import { getAppSettings } from '../lib/appSettings'
import { appendAuditEvent } from '../lib/auditLog'
import { saleLocalYmd } from '../lib/salesStats'
import {
  combineDateAndTimeToTs,
  computeTeamPresence,
  formatDateLong,
  formatDateShortYmd,
  formatDurationHm,
  formatDurationMs,
  formatTimeHm,
  isCurrentlyIn,
  isLateFirstIn,
  parseExpectedStartMinutes,
  periodStartMs,
  sortPunchesAsc,
  summarizeByDay,
  summarizeByProfile,
  totalWorkedMsIncludingOpen,
  type PointagePeriodDays,
} from '../lib/timePunchHelpers'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { MobileDataCard, ResponsiveData } from '../ui/ResponsiveData'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconDownload, IconLogin, IconLogout, IconTrash } from '../ui/icons'

type Props = {
  staff: StaffProfile
  activeStoreId: string
  activeStoreLabel: string
  canViewTeamPointage: boolean
}

type ViewTab = 'mine' | 'team' | 'synthesis'

function punchKindLabel(k: TimePunchKind): string {
  return k === 'in' ? 'Arrivée' : 'Départ'
}

function punchKindBadgeTone(k: TimePunchKind): 'success' | 'neutral' {
  return k === 'in' ? 'success' : 'neutral'
}

function downloadCsv(filename: string, rows: string[][]): void {
  const bom = '\uFEFF'
  const esc = (c: string) => `"${c.replace(/"/g, '""')}"`
  const lines = rows.map((r) => r.map((c) => esc(String(c))).join(','))
  const blob = new Blob([bom + lines.join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function PointageView({
  staff,
  activeStoreId,
  activeStoreLabel,
  canViewTeamPointage,
}: Props) {
  const toast = useToast()
  const appSettings = getAppSettings()
  const expectedStartMinutes = parseExpectedStartMinutes(
    appSettings.pointageExpectedStartTime,
  )
  const expectedDailyMs = appSettings.pointageExpectedDailyHours * 60 * 60 * 1000

  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [profiles, setProfiles] = useState(() => listStaffProfiles())
  const [filterProfileId, setFilterProfileId] = useState<string>('all')
  const [filterStoreId, setFilterStoreId] = useState<string>('all')
  const [periodDays, setPeriodDays] = useState<PointagePeriodDays>(14)
  const [viewTab, setViewTab] = useState<ViewTab>('mine')
  const [clock, setClock] = useState(() => Date.now())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingDeleteUntil, setPendingDeleteUntil] = useState(0)

  const [manualProfileId, setManualProfileId] = useState(staff.id)
  const [manualKind, setManualKind] = useState<TimePunchKind>('in')
  const [manualDate, setManualDate] = useState(() => saleLocalYmd(Date.now()))
  const [manualTime, setManualTime] = useState('08:00')
  const [manualNote, setManualNote] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  useEffect(() => {
    return subscribeStaffProfiles(() => {
      setProfiles(listStaffProfiles())
    })
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []

  const punchesRaw =
    useLiveQuery(
      () => db.timePunches.orderBy('createdAt').reverse().limit(3000).toArray(),
      [],
      [],
    ) ?? []

  const todayYmd = saleLocalYmd(clock)
  const periodSince = periodStartMs(periodDays, clock)

  const allMineAsc = useMemo(() => {
    const mine = punchesRaw.filter((p) => p.profileId === staff.id)
    return sortPunchesAsc(mine)
  }, [punchesRaw, staff.id])

  const myTodayAsc = useMemo(() => {
    const mine = punchesRaw.filter(
      (p) =>
        p.profileId === staff.id && saleLocalYmd(p.createdAt) === todayYmd,
    )
    return sortPunchesAsc(mine)
  }, [punchesRaw, staff.id, todayYmd])

  const onSite = useMemo(() => isCurrentlyIn(allMineAsc), [allMineAsc])
  const workedTodayMs = useMemo(
    () => totalWorkedMsIncludingOpen(myTodayAsc, clock),
    [myTodayAsc, clock],
  )
  const firstInToday = useMemo(
    () => myTodayAsc.find((p) => p.kind === 'in'),
    [myTodayAsc],
  )
  const currentOpenInAt = useMemo(() => {
    if (!onSite || allMineAsc.length === 0) return undefined
    return allMineAsc[allMineAsc.length - 1].createdAt
  }, [allMineAsc, onSite])
  const lastOutToday = useMemo(() => {
    for (let i = myTodayAsc.length - 1; i >= 0; i--) {
      if (myTodayAsc[i].kind === 'out') return myTodayAsc[i]
    }
    return undefined
  }, [myTodayAsc])
  const lastPunchMine = useMemo(() => {
    if (allMineAsc.length === 0) return undefined
    return allMineAsc[allMineAsc.length - 1]
  }, [allMineAsc])

  const teamPresence = useMemo(
    () =>
      computeTeamPresence({
        profiles,
        punches: punchesRaw,
        todayYmd,
        storeId: filterStoreId === 'all' ? undefined : filterStoreId,
        now: clock,
        expectedStartMinutes,
      }),
    [
      profiles,
      punchesRaw,
      todayYmd,
      filterStoreId,
      clock,
      expectedStartMinutes,
    ],
  )

  const onSiteCount = useMemo(
    () => teamPresence.filter((r) => r.onSite).length,
    [teamPresence],
  )

  const periodSummaries = useMemo(
    () =>
      summarizeByProfile(
        punchesRaw,
        periodSince,
        profiles,
        filterStoreId === 'all' ? undefined : filterStoreId,
      ),
    [punchesRaw, periodSince, profiles, filterStoreId],
  )

  const daySummaries = useMemo(
    () =>
      summarizeByDay(
        punchesRaw,
        periodSince,
        expectedStartMinutes,
        filterProfileId === 'all' ? undefined : filterProfileId,
        filterStoreId === 'all' ? undefined : filterStoreId,
      ),
    [
      punchesRaw,
      periodSince,
      expectedStartMinutes,
      filterProfileId,
      filterStoreId,
    ],
  )

  const tableRows = useMemo(() => {
    let rows = punchesRaw.filter((p) => p.createdAt >= periodSince)
    if (!canViewTeamPointage) {
      rows = rows.filter((p) => p.profileId === staff.id)
    } else {
      if (filterProfileId !== 'all') {
        rows = rows.filter((p) => p.profileId === filterProfileId)
      }
      if (filterStoreId !== 'all') {
        rows = rows.filter((p) => p.storeId === filterStoreId)
      }
    }
    return rows
  }, [
    punchesRaw,
    periodSince,
    canViewTeamPointage,
    filterProfileId,
    filterStoreId,
    staff.id,
  ])

  const sortedTableDesc = useMemo(
    () => [...tableRows].sort((a, b) => b.createdAt - a.createdAt),
    [tableRows],
  )

  const viewTabs = useMemo(() => {
    const items: { id: ViewTab; label: string; count?: number }[] = [
      { id: 'mine', label: 'Mon pointage' },
    ]
    if (canViewTeamPointage) {
      items.push(
        { id: 'team', label: 'Équipe', count: onSiteCount > 0 ? onSiteCount : undefined },
        { id: 'synthesis', label: 'Synthèse' },
      )
    }
    return items
  }, [canViewTeamPointage, onSiteCount])

  const handlePunch = useCallback(
    async (kind: TimePunchKind) => {
      if (busy) return
      if (lastPunchMine?.kind === kind) {
        toast.warning(
          'Pointage refusé',
          `Le dernier enregistrement est déjà une « ${punchKindLabel(kind).toLowerCase()} ».`,
        )
        return
      }
      setBusy(true)
      try {
        const row: TimePunch = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          profileId: staff.id,
          profileDisplayName: staff.displayName,
          storeId: activeStoreId,
          storeName: activeStoreLabel,
          kind,
          note: note.trim() || undefined,
          source: 'self',
        }
        await db.timePunches.add(row)
        setNote('')
        void appendAuditEvent({
          kind: 'time_punch',
          actor: {
            profileId: staff.id,
            displayName: staff.displayName,
          },
          reason:
            kind === 'in'
              ? `Pointage arrivée · ${activeStoreLabel}`
              : `Pointage départ · ${activeStoreLabel}`,
          payload: {
            punchId: row.id,
            kind,
            storeId: activeStoreId,
            storeName: activeStoreLabel,
            note: row.note,
            source: 'self',
          },
        })
        toast.success(
          kind === 'in' ? 'Arrivée enregistrée' : 'Départ enregistré',
          `${formatTimeHm(row.createdAt)} · ${activeStoreLabel}`,
        )
      } catch (e) {
        toast.error(
          'Enregistrement impossible',
          e instanceof Error ? e.message : String(e),
        )
      } finally {
        setBusy(false)
      }
    },
    [
      activeStoreId,
      activeStoreLabel,
      busy,
      lastPunchMine?.kind,
      note,
      staff.displayName,
      staff.id,
      toast,
    ],
  )

  const addManualPunch = useCallback(async () => {
    if (!canViewTeamPointage) return
    const target = profiles.find((p) => p.id === manualProfileId)
    if (!target) {
      toast.error('Collaborateur invalide')
      return
    }
    const reason = manualNote.trim()
    if (!reason) {
      toast.error('Motif obligatoire pour une saisie manuelle')
      return
    }
    setManualBusy(true)
    try {
      const createdAt = combineDateAndTimeToTs(manualDate, manualTime)
      const store =
        filterStoreId === 'all'
          ? stores.find((s) => s.id === activeStoreId) ?? stores[0]
          : stores.find((s) => s.id === filterStoreId)
      const storeId = store?.id ?? activeStoreId
      const storeName = store?.name ?? activeStoreLabel
      const row: TimePunch = {
        id: crypto.randomUUID(),
        createdAt,
        profileId: target.id,
        profileDisplayName: target.displayName,
        storeId,
        storeName,
        kind: manualKind,
        note: reason,
        source: 'manager',
        addedByProfileId: staff.id,
        addedByDisplayName: staff.displayName,
      }
      await db.timePunches.add(row)
      void appendAuditEvent({
        kind: 'time_punch',
        actor: { profileId: staff.id, displayName: staff.displayName },
        reason: `Saisie manuelle pointage · ${target.displayName}`,
        payload: { punchId: row.id, kind: manualKind, createdAt, note: reason },
      })
      setManualNote('')
      toast.success('Pointage ajouté', `${target.displayName} · ${punchKindLabel(manualKind)}`)
    } catch (e) {
      toast.error(
        'Saisie impossible',
        e instanceof Error ? e.message : String(e),
      )
    } finally {
      setManualBusy(false)
    }
  }, [
    activeStoreId,
    activeStoreLabel,
    canViewTeamPointage,
    filterStoreId,
    manualDate,
    manualKind,
    manualNote,
    manualProfileId,
    manualTime,
    profiles,
    staff.displayName,
    staff.id,
    stores,
    toast,
  ])

  const deletePunch = useCallback(
    async (punch: TimePunch) => {
      if (!canViewTeamPointage) return
      const now = Date.now()
      if (pendingDeleteId !== punch.id || now > pendingDeleteUntil) {
        setPendingDeleteId(punch.id)
        setPendingDeleteUntil(now + 7000)
        toast.warning('Confirmer la suppression', 'Cliquez à nouveau sous 7 secondes.')
        return
      }
      await db.timePunches.delete(punch.id)
      setPendingDeleteId(null)
      setPendingDeleteUntil(0)
      void appendAuditEvent({
        kind: 'time_punch',
        actor: { profileId: staff.id, displayName: staff.displayName },
        reason: `Suppression pointage · ${punch.profileDisplayName}`,
        payload: {
          deletedPunchId: punch.id,
          kind: punch.kind,
          createdAt: punch.createdAt,
          profileId: punch.profileId,
        },
      })
      toast.success('Pointage supprimé')
    },
    [
      canViewTeamPointage,
      pendingDeleteId,
      pendingDeleteUntil,
      staff.displayName,
      staff.id,
      toast,
    ],
  )

  const exportCsv = useCallback(() => {
    const header = [
      'Date',
      'Heure',
      'Type',
      'Collaborateur',
      'Magasin',
      'Source',
      'Note',
    ]
    const lines: string[][] = [header]
    const sorted = [...tableRows].sort((a, b) => a.createdAt - b.createdAt)
    for (const p of sorted) {
      const d = new Date(p.createdAt)
      lines.push([
        saleLocalYmd(p.createdAt),
        d.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        punchKindLabel(p.kind),
        p.profileDisplayName,
        p.storeName ?? p.storeId,
        p.source === 'manager' ? 'Manager' : 'Auto',
        p.note ?? '',
      ])
    }
    if (canViewTeamPointage && periodSummaries.length > 0) {
      lines.push([])
      lines.push(['Synthèse période', `${periodDays} jours`])
      lines.push(['Collaborateur', 'Heures totales', 'Jours pointés'])
      for (const s of periodSummaries) {
        lines.push([
          s.displayName,
          formatDurationHm(s.totalMs),
          String(s.daysWithPunches),
        ])
      }
    }
    downloadCsv(
      `pointage-${periodDays}j-${saleLocalYmd(Date.now())}.csv`,
      lines,
    )
    toast.success('Export CSV', `${sorted.length} ligne(s)`)
  }, [canViewTeamPointage, periodDays, periodSummaries, tableRows, toast])

  const lateToday = firstInToday
    ? isLateFirstIn(firstInToday.createdAt, expectedStartMinutes)
    : false

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconLogin />}
        eyebrow="Équipe"
        title="Présences"
        subtitle="Arrivées, départs, présence équipe et synthèse des heures"
        actions={
          sortedTableDesc.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<IconDownload />}
              onClick={exportCsv}
            >
              Exporter CSV
            </Button>
          ) : null
        }
      />

      <Tabs
        variant="segmented"
        items={viewTabs}
        active={viewTab}
        onChange={setViewTab}
      />

      {viewTab === 'mine' ? (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Aujourd’hui · {activeStoreLabel}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
                      {staff.displayName}
                    </p>
                    <p className="mt-0.5 font-mono-nums text-[22px] font-semibold text-zinc-800">
                      {new Intl.DateTimeFormat('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }).format(new Date(clock))}
                    </p>
                    <p className="mt-0.5 text-[13px] text-zinc-600">
                      {onSite ? (
                        <span className="text-emerald-700">
                          Sur site depuis{' '}
                          {currentOpenInAt ? formatTimeHm(currentOpenInAt) : '—'}
                        </span>
                      ) : (
                        <span>Hors site</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={onSite ? 'success' : 'neutral'}>
                      {onSite ? 'Présence ouverte' : 'Pas de présence'}
                    </Badge>
                    {firstInToday && lateToday ? (
                      <Badge tone="warning">Retard</Badge>
                    ) : null}
                  </div>
                </div>

                <Field label="Note (optionnelle)" hint="Visible dans l’historique et l’export.">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex. Télétravail matin, sortie livraison…"
                    maxLength={240}
                  />
                </Field>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    size="lg"
                    variant="accent"
                    className="h-14 text-[15px]"
                    iconLeft={<IconLogin />}
                    loading={busy}
                    disabled={onSite}
                    onClick={() => void handlePunch('in')}
                  >
                    Arrivée
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-14 border-rose-200 bg-rose-50 text-[15px] text-rose-900 hover:bg-rose-100"
                    iconLeft={<IconLogout />}
                    loading={busy}
                    disabled={!onSite}
                    onClick={() => void handlePunch('out')}
                  >
                    Départ
                  </Button>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Arrivée attendue avant{' '}
                  <strong>{appSettings.pointageExpectedStartTime}</strong> · objectif{' '}
                  {appSettings.pointageExpectedDailyHours} h / jour (réglable dans Paramètres).
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <Kpi
                label="Temps pointé (jour)"
                value={formatDurationMs(workedTodayMs)}
                hint={
                  workedTodayMs >= expectedDailyMs
                    ? 'Objectif journalier atteint'
                    : `Objectif ${appSettings.pointageExpectedDailyHours} h`
                }
                tone={workedTodayMs >= expectedDailyMs ? 'accent' : 'neutral'}
              />
              <Kpi
                label="Première arrivée"
                value={firstInToday ? formatTimeHm(firstInToday.createdAt) : '—'}
              />
              <Kpi
                label="Dernier départ"
                value={lastOutToday ? formatTimeHm(lastOutToday.createdAt) : '—'}
              />
            </div>
          </div>

          <HistoryCard
            title="Mon historique"
            subtitle={`${periodDays} derniers jours`}
            periodDays={periodDays}
            onPeriodChange={setPeriodDays}
            sortedTableDesc={sortedTableDesc.filter((p) => p.profileId === staff.id)}
            canViewTeamPointage={false}
            onDelete={undefined}
            pendingDeleteId={null}
          />
        </>
      ) : null}

      {viewTab === 'team' && canViewTeamPointage ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              label="Sur site maintenant"
              value={String(onSiteCount)}
              hint={`Sur ${profiles.length} collaborateurs`}
              tone="accent"
            />
            <Kpi
              label="Absents aujourd’hui"
              value={String(teamPresence.filter((r) => !r.punchedToday).length)}
              tone="amber"
            />
            <Kpi
              label="Retards du jour"
              value={String(teamPresence.filter((r) => r.late).length)}
              tone="rose"
            />
          </div>

          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <SectionHeader
                  title="Présence aujourd’hui"
                  subtitle={formatDateLong(clock)}
                />
                <Field label="Magasin" className="sm:w-52">
                  <Select
                    value={filterStoreId}
                    onChange={(e) => setFilterStoreId(e.target.value)}
                  >
                    <option value="all">Tous les magasins</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <ResponsiveData
                table={
                  <Table>
                    <THead>
                      <Tr>
                        <Th sticky>Collaborateur</Th>
                        <Th>Statut</Th>
                        <Th hideBelow="lg">Dernière action</Th>
                        <Th hideBelow="xl">Magasin</Th>
                        <Th align="right">Temps jour</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {teamPresence.map((row) => (
                        <Tr key={row.profileId}>
                          <Td sticky className="font-medium">
                            {row.displayName}
                          </Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              <Badge tone={row.onSite ? 'success' : 'neutral'}>
                                {row.onSite
                                  ? 'Sur site'
                                  : row.punchedToday
                                    ? 'Parti'
                                    : 'Absent'}
                              </Badge>
                              {row.late ? <Badge tone="warning">Retard</Badge> : null}
                            </div>
                          </Td>
                          <Td className="text-[12px] text-zinc-600" hideBelow="lg">
                            {row.lastPunchAt
                              ? `${punchKindLabel(row.lastPunchKind ?? 'in')} · ${formatTimeHm(row.lastPunchAt)}`
                              : '—'}
                          </Td>
                          <Td
                            className="max-w-[120px] truncate text-[12px]"
                            hideBelow="xl"
                          >
                            {row.storeName ?? '—'}
                          </Td>
                          <Td align="right" mono>
                            {formatDurationMs(row.workedTodayMs)}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                }
                cards={
                  <ul className="grid gap-2">
                    {teamPresence.map((row) => (
                      <MobileDataCard
                        key={row.profileId}
                        title={row.displayName}
                        meta={
                          <span className="inline-flex flex-wrap gap-1">
                            <Badge tone={row.onSite ? 'success' : 'neutral'}>
                              {row.onSite
                                ? 'Sur site'
                                : row.punchedToday
                                  ? 'Parti'
                                  : 'Absent'}
                            </Badge>
                            {row.late ? <Badge tone="warning">Retard</Badge> : null}
                          </span>
                        }
                        body={
                          <div className="space-y-1">
                            <p>
                              Dernière action :{' '}
                              {row.lastPunchAt
                                ? `${punchKindLabel(row.lastPunchKind ?? 'in')} · ${formatTimeHm(row.lastPunchAt)}`
                                : '—'}
                            </p>
                            <p>Magasin : {row.storeName ?? '—'}</p>
                            <p className="font-mono-nums font-semibold text-ink">
                              Temps jour : {formatDurationMs(row.workedTodayMs)}
                            </p>
                          </div>
                        }
                      />
                    ))}
                  </ul>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <SectionHeader
                title="Saisie manuelle (manager)"
                subtitle="Corriger ou ajouter un pointage oublié — motif obligatoire"
              />
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Collaborateur">
                  <Select
                    value={manualProfileId}
                    onChange={(e) => setManualProfileId(e.target.value)}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Type">
                  <Select
                    value={manualKind}
                    onChange={(e) => setManualKind(e.target.value as TimePunchKind)}
                  >
                    <option value="in">Arrivée</option>
                    <option value="out">Départ</option>
                  </Select>
                </Field>
                <Field label="Date">
                  <Input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                  />
                </Field>
                <Field label="Heure">
                  <Input
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                  />
                </Field>
                <Field label="Motif" className="md:col-span-2">
                  <Input
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    placeholder="Ex. Oubli badge, correction après coupure réseau…"
                  />
                </Field>
              </div>
              <Button
                variant="accent"
                loading={manualBusy}
                onClick={() => void addManualPunch()}
              >
                Enregistrer le pointage
              </Button>
            </CardContent>
          </Card>

          <HistoryCard
            title="Historique équipe"
            subtitle={`${periodDays} derniers jours`}
            periodDays={periodDays}
            onPeriodChange={setPeriodDays}
            filterProfileId={filterProfileId}
            onFilterProfileChange={setFilterProfileId}
            filterStoreId={filterStoreId}
            onFilterStoreChange={setFilterStoreId}
            profiles={profiles}
            stores={stores}
            sortedTableDesc={sortedTableDesc}
            canViewTeamPointage
            onDelete={deletePunch}
            pendingDeleteId={pendingDeleteId}
          />
        </>
      ) : null}

      {viewTab === 'synthesis' && canViewTeamPointage ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Période">
              <Select
                value={String(periodDays)}
                onChange={(e) =>
                  setPeriodDays(Number.parseInt(e.target.value, 10) as PointagePeriodDays)
                }
              >
                <option value="7">7 jours</option>
                <option value="14">14 jours</option>
                <option value="30">30 jours</option>
              </Select>
            </Field>
            <Field label="Magasin">
              <Select
                value={filterStoreId}
                onChange={(e) => setFilterStoreId(e.target.value)}
              >
                <option value="all">Tous</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Collaborateur">
              <Select
                value={filterProfileId}
                onChange={(e) => setFilterProfileId(e.target.value)}
              >
                <option value="all">Tous</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Card>
            <CardContent className="space-y-3">
              <SectionHeader
                title="Heures par collaborateur"
                subtitle={`Total sur ${periodDays} jours`}
              />
              {periodSummaries.length === 0 ? (
                <EmptyState title="Aucune donnée" variant="flat" />
              ) : (
                <ResponsiveData
                  table={
                    <Table>
                      <THead>
                        <Tr>
                          <Th sticky>Collaborateur</Th>
                          <Th align="right">Heures totales</Th>
                          <Th align="right" hideBelow="lg">
                            Jours pointés
                          </Th>
                          <Th align="right" hideBelow="lg">
                            Moy. / jour
                          </Th>
                        </Tr>
                      </THead>
                      <TBody>
                        {periodSummaries.map((row) => (
                          <Tr key={row.profileId}>
                            <Td sticky>{row.displayName}</Td>
                            <Td align="right" mono>
                              {formatDurationHm(row.totalMs)}
                            </Td>
                            <Td align="right" mono hideBelow="lg">
                              {row.daysWithPunches}
                            </Td>
                            <Td align="right" mono hideBelow="lg">
                              {row.daysWithPunches > 0
                                ? formatDurationHm(
                                    Math.round(row.totalMs / row.daysWithPunches),
                                  )
                                : '—'}
                            </Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  }
                  cards={
                    <ul className="grid gap-2">
                      {periodSummaries.map((row) => (
                        <MobileDataCard
                          key={row.profileId}
                          title={row.displayName}
                          body={
                            <div className="grid grid-cols-2 gap-1.5">
                              <span className="col-span-2 font-mono-nums font-semibold text-ink">
                                Total : {formatDurationHm(row.totalMs)}
                              </span>
                              <span>Jours : {row.daysWithPunches}</span>
                              <span>
                                Moy. :{' '}
                                {row.daysWithPunches > 0
                                  ? formatDurationHm(
                                      Math.round(row.totalMs / row.daysWithPunches),
                                    )
                                  : '—'}
                              </span>
                            </div>
                          }
                        />
                      ))}
                    </ul>
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <SectionHeader title="Détail par jour" />
              {daySummaries.length === 0 ? (
                <EmptyState title="Aucune journée sur la période" variant="flat" />
              ) : (
                <div className="ui-scroll max-h-[min(48vh,480px)] overflow-auto">
                  <ResponsiveData
                    table={
                      <Table>
                        <THead>
                          <Tr>
                            <Th sticky>Date</Th>
                            <Th>Collaborateur</Th>
                            <Th hideBelow="lg">Arrivée</Th>
                            <Th hideBelow="lg">Départ</Th>
                            <Th align="right">Durée</Th>
                            <Th hideBelow="xl">Retard</Th>
                          </Tr>
                        </THead>
                        <TBody>
                          {daySummaries.map((row) => (
                            <Tr key={`${row.ymd}-${row.profileId}`}>
                              <Td sticky>{formatDateShortYmd(row.ymd)}</Td>
                              <Td>{row.displayName}</Td>
                              <Td mono hideBelow="lg">
                                {row.firstIn ? formatTimeHm(row.firstIn) : '—'}
                              </Td>
                              <Td mono hideBelow="lg">
                                {row.lastOut ? formatTimeHm(row.lastOut) : '—'}
                              </Td>
                              <Td align="right" mono>
                                {formatDurationHm(row.workedMs)}
                              </Td>
                              <Td hideBelow="xl">
                                {row.late ? (
                                  <Badge tone="warning">Oui</Badge>
                                ) : (
                                  <span className="text-ink-subtle">—</span>
                                )}
                              </Td>
                            </Tr>
                          ))}
                        </TBody>
                      </Table>
                    }
                    cards={
                      <ul className="grid gap-2">
                        {daySummaries.map((row) => (
                          <MobileDataCard
                            key={`${row.ymd}-${row.profileId}`}
                            title={formatDateShortYmd(row.ymd)}
                            meta={row.displayName}
                            body={
                              <div className="grid grid-cols-2 gap-1.5">
                                <span>
                                  Arrivée :{' '}
                                  {row.firstIn ? formatTimeHm(row.firstIn) : '—'}
                                </span>
                                <span>
                                  Départ :{' '}
                                  {row.lastOut ? formatTimeHm(row.lastOut) : '—'}
                                </span>
                                <span className="font-mono-nums font-semibold">
                                  Durée : {formatDurationHm(row.workedMs)}
                                </span>
                                <span>
                                  Retard : {row.late ? 'Oui' : '—'}
                                </span>
                              </div>
                            }
                          />
                        ))}
                      </ul>
                    }
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

type HistoryCardProps = {
  title: string
  subtitle: string
  periodDays: PointagePeriodDays
  onPeriodChange: (d: PointagePeriodDays) => void
  sortedTableDesc: TimePunch[]
  canViewTeamPointage: boolean
  onDelete?: (p: TimePunch) => void
  pendingDeleteId: string | null
  filterProfileId?: string
  onFilterProfileChange?: (id: string) => void
  filterStoreId?: string
  onFilterStoreChange?: (id: string) => void
  profiles?: StaffProfile[]
  stores?: { id: string; name: string }[]
}

function HistoryCard({
  title,
  subtitle,
  periodDays,
  onPeriodChange,
  sortedTableDesc,
  canViewTeamPointage,
  onDelete,
  pendingDeleteId,
  filterProfileId,
  onFilterProfileChange,
  filterStoreId,
  onFilterStoreChange,
  profiles,
  stores,
}: HistoryCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeader title={title} subtitle={subtitle} />
          <div className="flex flex-wrap gap-2">
            <Field label="Période" className="w-36">
              <Select
                value={String(periodDays)}
                onChange={(e) =>
                  onPeriodChange(Number.parseInt(e.target.value, 10) as PointagePeriodDays)
                }
              >
                <option value="7">7 jours</option>
                <option value="14">14 jours</option>
                <option value="30">30 jours</option>
              </Select>
            </Field>
            {canViewTeamPointage && onFilterProfileChange && profiles ? (
              <Field label="Collaborateur" className="w-44">
                <Select
                  value={filterProfileId ?? 'all'}
                  onChange={(e) => onFilterProfileChange(e.target.value)}
                >
                  <option value="all">Toute l’équipe</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {canViewTeamPointage && onFilterStoreChange && stores ? (
              <Field label="Magasin" className="w-44">
                <Select
                  value={filterStoreId ?? 'all'}
                  onChange={(e) => onFilterStoreChange(e.target.value)}
                >
                  <option value="all">Tous</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </div>

        {sortedTableDesc.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-zinc-500">
            Aucun pointage sur cette période.
          </p>
        ) : (
          <div className="ui-scroll -mx-1 max-h-[min(52vh,520px)] overflow-auto px-1">
            <ResponsiveData
              table={
                <Table>
                  <THead>
                    <Tr>
                      <Th sticky>Date & heure</Th>
                      <Th>Type</Th>
                      {canViewTeamPointage ? (
                        <Th hideBelow="lg">Collaborateur</Th>
                      ) : null}
                      <Th hideBelow="xl">Magasin</Th>
                      <Th hideBelow="lg">Note</Th>
                      {onDelete ? <Th align="right">Action</Th> : null}
                    </Tr>
                  </THead>
                  <TBody>
                    {sortedTableDesc.map((p) => (
                      <Tr key={p.id}>
                        <Td sticky className="whitespace-nowrap">
                          <span className="block text-[12px] font-medium text-zinc-900">
                            {formatDateLong(p.createdAt)}
                          </span>
                          <span className="font-mono-nums text-[11px] text-zinc-500">
                            {formatTimeHm(p.createdAt)}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            <Badge tone={punchKindBadgeTone(p.kind)}>
                              {punchKindLabel(p.kind)}
                            </Badge>
                            {p.source === 'manager' ? (
                              <Badge tone="neutral">Manager</Badge>
                            ) : null}
                          </div>
                        </Td>
                        {canViewTeamPointage ? (
                          <Td
                            className="max-w-[140px] truncate text-[12px]"
                            hideBelow="lg"
                          >
                            {p.profileDisplayName}
                          </Td>
                        ) : null}
                        <Td
                          className="max-w-[120px] truncate text-[12px] text-zinc-600"
                          hideBelow="xl"
                        >
                          {p.storeName ?? p.storeId}
                        </Td>
                        <Td
                          className="max-w-[200px] truncate text-[12px] text-zinc-500"
                          hideBelow="lg"
                        >
                          {p.note ?? '—'}
                        </Td>
                        {onDelete ? (
                          <Td align="right">
                            <Button
                              size="sm"
                              variant="ghost"
                              iconLeft={<IconTrash />}
                              onClick={() => void onDelete(p)}
                              className={
                                pendingDeleteId === p.id
                                  ? 'text-rose-700'
                                  : undefined
                              }
                            >
                              {pendingDeleteId === p.id ? 'Confirmer' : 'Suppr.'}
                            </Button>
                          </Td>
                        ) : null}
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <ul className="grid gap-2">
                  {sortedTableDesc.map((p) => (
                    <MobileDataCard
                      key={p.id}
                      title={`${formatDateLong(p.createdAt)} · ${formatTimeHm(p.createdAt)}`}
                      meta={
                        <span className="inline-flex flex-wrap gap-1">
                          <Badge tone={punchKindBadgeTone(p.kind)}>
                            {punchKindLabel(p.kind)}
                          </Badge>
                          {p.source === 'manager' ? (
                            <Badge tone="neutral">Manager</Badge>
                          ) : null}
                        </span>
                      }
                      body={
                        <div className="space-y-1">
                          {canViewTeamPointage ? (
                            <p>{p.profileDisplayName}</p>
                          ) : null}
                          <p>Magasin : {p.storeName ?? p.storeId}</p>
                          <p>Note : {p.note ?? '—'}</p>
                        </div>
                      }
                      actions={
                        onDelete ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            fullWidth
                            iconLeft={<IconTrash />}
                            onClick={() => void onDelete(p)}
                            className={
                              pendingDeleteId === p.id
                                ? 'text-rose-700'
                                : undefined
                            }
                          >
                            {pendingDeleteId === p.id ? 'Confirmer' : 'Supprimer'}
                          </Button>
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
