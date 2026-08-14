import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import type {
  DiningTable,
  DiningTableStatus,
  TableReservation,
  TableReservationStatus,
} from '../db/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconClock, IconStore, IconUser } from '../ui/icons'
import {
  APP_SETTINGS_CHANGED_EVENT,
  getAppSettings,
  saveAppSettings,
} from '../lib/appSettings'

type Props = {
  activeStoreId: string
  activeStoreLabel: string
  canManageTables: boolean
}

const STATUS_LABELS: Record<DiningTableStatus, string> = {
  free: 'Libre',
  occupied: 'Occupée',
  reserved: 'Réservée',
  cleaning: 'Nettoyage',
}

const RESERVATION_STATUS_LABELS: Record<TableReservationStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  seated: 'Installée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  no_show: 'Absent',
}

function statusTone(
  status: DiningTableStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'free':
      return 'success'
    case 'reserved':
      return 'warning'
    case 'occupied':
      return 'danger'
    case 'cleaning':
      return 'neutral'
  }
}

function reservationTone(
  status: TableReservationStatus,
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'pending':
      return 'warning'
    case 'confirmed':
      return 'neutral'
    case 'seated':
      return 'success'
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'danger'
    case 'no_show':
      return 'danger'
  }
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m} min`
  return `${h} h ${m.toString().padStart(2, '0')}`
}

function toLocalDateInput(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toLocalTimeInput(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function mergeDateTimeToTs(dateInput: string, timeInput: string): number | null {
  if (!dateInput || !timeInput) return null
  const [y, m, d] = dateInput.split('-').map(Number)
  const [hh, mm] = timeInput.split(':').map(Number)
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mm)
  ) {
    return null
  }
  const ts = new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
  return Number.isFinite(ts) ? ts : null
}

function startOfDayTs(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

export function TablesManagementView({
  activeStoreId,
  activeStoreLabel,
  canManageTables,
}: Props) {
  const toast = useToast()
  const tables =
    useLiveQuery(
      () =>
        db.diningTables
          .where('storeId')
          .equals(activeStoreId)
          .sortBy('sortOrder'),
      [activeStoreId],
      [],
    ) ?? []
  const reservations =
    useLiveQuery(
      () =>
        db.tableReservations
          .where('storeId')
          .equals(activeStoreId)
          .reverse()
          .sortBy('startAt'),
      [activeStoreId],
      [],
    ) ?? []

  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [area, setArea] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | DiningTableStatus>('all')
  const [selectedTableId, setSelectedTableId] = useState('')
  const [reservationBusy, setReservationBusy] = useState(false)
  const [reservationStatusFilter, setReservationStatusFilter] = useState<
    'all' | TableReservationStatus
  >('all')

  const now = Date.now()
  const defaultStart = new Date(now + 30 * 60000)
  const [resCustomerName, setResCustomerName] = useState('')
  const [resPhone, setResPhone] = useState('')
  const [resGuests, setResGuests] = useState('2')
  const [resDate, setResDate] = useState(toLocalDateInput(defaultStart.getTime()))
  const [resTime, setResTime] = useState(toLocalTimeInput(defaultStart.getTime()))
  const [resDurationMin, setResDurationMin] = useState('90')
  const [resNotes, setResNotes] = useState('')
  const [autoReleaseEnabled, setAutoReleaseEnabled] = useState(
    () => getAppSettings().tableAutoReleaseEnabled,
  )
  const [autoReleaseMinutes, setAutoReleaseMinutes] = useState(
    () => getAppSettings().tableAutoReleaseMinutes,
  )

  const summary = useMemo(() => {
    const out: Record<DiningTableStatus, number> = {
      free: 0,
      occupied: 0,
      reserved: 0,
      cleaning: 0,
    }
    for (const table of tables) {
      out[table.status] += 1
    }
    return out
  }, [tables])

  const activeReservationsByTable = useMemo(() => {
    const map = new Map<string, TableReservation>()
    const nowTs = Date.now()
    for (const r of reservations) {
      if (
        r.status !== 'confirmed' &&
        r.status !== 'seated' &&
        r.status !== 'pending'
      ) {
        continue
      }
      if (r.startAt <= nowTs && r.endAt >= nowTs) {
        map.set(r.tableId, r)
      }
    }
    return map
  }, [reservations])

  const visibleTables = useMemo(() => {
    const list = [...tables]
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'))
    if (statusFilter === 'all') return list
    return list.filter((t) => t.status === statusFilter)
  }, [tables, statusFilter])

  const occupancyPct = useMemo(() => {
    if (tables.length === 0) return 0
    const occupied = tables.filter((t) => t.status === 'occupied').length
    return Math.round((occupied / tables.length) * 100)
  }, [tables])

  const stats = useMemo(() => {
    const nowTs = Date.now()
    const dayStart = startOfDayTs(nowTs)
    const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1
    const weekStart = dayStart - 6 * 24 * 60 * 60 * 1000

    const todayReservations = reservations.filter(
      (r) => r.startAt >= dayStart && r.startAt <= dayEnd,
    )
    const todayPending = todayReservations.filter((r) => r.status === 'pending').length
    const todayConfirmed = todayReservations.filter((r) => r.status === 'confirmed').length
    const todaySeated = todayReservations.filter((r) => r.status === 'seated').length
    const todayCompleted = todayReservations.filter((r) => r.status === 'completed').length
    const todayCancelled = todayReservations.filter((r) => r.status === 'cancelled').length
    const todayNoShow = todayReservations.filter((r) => r.status === 'no_show').length
    const noShowRate =
      todayReservations.length > 0
        ? Math.round((todayNoShow / todayReservations.length) * 100)
        : 0

    const avgPlannedDurationMin =
      todayReservations.length > 0
        ? Math.round(
            todayReservations.reduce(
              (sum, r) => sum + Math.max(0, Math.round((r.endAt - r.startAt) / 60000)),
              0,
            ) / todayReservations.length,
          )
        : 0

    const occupiedDurations = tables
      .filter((t) => t.status === 'occupied' && !!t.occupiedSince)
      .map((t) => Math.max(0, nowTs - (t.occupiedSince ?? nowTs)))
    const avgCurrentOccupancyMin =
      occupiedDurations.length > 0
        ? Math.round(
            occupiedDurations.reduce((sum, ms) => sum + ms, 0) /
              occupiedDurations.length /
              60000,
          )
        : 0

    const weekReservations = reservations.filter(
      (r) =>
        r.startAt >= weekStart &&
        r.startAt <= dayEnd &&
        (r.status === 'seated' || r.status === 'completed'),
    )
    const weeklyTurnoverPerTable =
      tables.length > 0
        ? Number((weekReservations.length / tables.length).toFixed(1))
        : 0

    const dailyTrend = Array.from({ length: 7 }, (_, idx) => {
      const dayTs = weekStart + idx * 24 * 60 * 60 * 1000
      const nextDayTs = dayTs + 24 * 60 * 60 * 1000
      return reservations.filter((r) => r.startAt >= dayTs && r.startAt < nextDayTs)
        .length
    })

    const hourBuckets = new Map<number, number>()
    for (const r of todayReservations) {
      const hour = new Date(r.startAt).getHours()
      hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1)
    }
    let peakHourLabel = '—'
    let peakHourCount = 0
    for (const [hour, count] of hourBuckets.entries()) {
      if (count > peakHourCount) {
        peakHourCount = count
        peakHourLabel = `${String(hour).padStart(2, '0')}:00`
      }
    }

    return {
      todayReservations: todayReservations.length,
      todayPending,
      todayConfirmed,
      todaySeated,
      todayCompleted,
      todayCancelled,
      todayNoShow,
      noShowRate,
      avgPlannedDurationMin,
      avgCurrentOccupancyMin,
      weeklyTurnoverPerTable,
      dailyTrend,
      peakHourLabel,
      peakHourCount,
    }
  }, [reservations, tables])
  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) ?? null,
    [tables, selectedTableId],
  )

  const upcomingReservations = useMemo(() => {
    const items = [...reservations].sort((a, b) => a.startAt - b.startAt)
    return items.slice(0, 8)
  }, [reservations])

  const visibleReservations = useMemo(() => {
    const items = [...reservations]
      .sort((a, b) => b.startAt - a.startAt)
      .filter((r) => r.endAt >= now - 24 * 60 * 60 * 1000)
    if (reservationStatusFilter === 'all') return items
    return items.filter((r) => r.status === reservationStatusFilter)
  }, [reservations, reservationStatusFilter, now])

  useEffect(() => {
    if (!selectedTableId && tables.length > 0) {
      setSelectedTableId(tables[0].id)
      return
    }
    if (selectedTableId && !tables.some((t) => t.id === selectedTableId)) {
      setSelectedTableId(tables[0]?.id ?? '')
    }
  }, [tables, selectedTableId])

  useEffect(() => {
    const sync = () => {
      const settings = getAppSettings()
      setAutoReleaseEnabled(settings.tableAutoReleaseEnabled)
      setAutoReleaseMinutes(settings.tableAutoReleaseMinutes)
    }
    window.addEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
    return () => window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, sync)
  }, [])

  useEffect(() => {
    saveAppSettings({
      tableAutoReleaseEnabled: autoReleaseEnabled,
      tableAutoReleaseMinutes: autoReleaseMinutes,
    })
  }, [autoReleaseEnabled, autoReleaseMinutes])

  useEffect(() => {
    if (!canManageTables || !autoReleaseEnabled) return
    const ttlMin = Number.parseInt(autoReleaseMinutes.trim(), 10)
    if (!Number.isFinite(ttlMin) || ttlMin < 15) return
    const intervalId = window.setInterval(() => {
      const thresholdTs = Date.now() - ttlMin * 60_000
      void db.transaction('rw', db.diningTables, async () => {
        const occupied = await db.diningTables
          .where('storeId')
          .equals(activeStoreId)
          .filter(
            (table) =>
              table.status === 'occupied' &&
              !!table.occupiedSince &&
              table.occupiedSince <= thresholdTs,
          )
          .toArray()
        if (occupied.length === 0) return
        for (const table of occupied) {
          await db.diningTables.update(table.id, {
            status: 'free',
            occupiedSince: undefined,
            note: undefined,
          })
        }
      })
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [activeStoreId, autoReleaseEnabled, autoReleaseMinutes, canManageTables])

  const createTable = async () => {
    const cleanName = name.trim()
    const cap = Number.parseInt(capacity.trim(), 10)
    if (!cleanName) {
      toast.error('Nom requis', 'Indiquez un nom de table.')
      return
    }
    if (!Number.isFinite(cap) || cap <= 0 || cap > 24) {
      toast.error('Capacité invalide', 'Utilisez une valeur entre 1 et 24.')
      return
    }
    const duplicate = tables.find(
      (t) => t.name.toLowerCase() === cleanName.toLowerCase(),
    )
    if (duplicate) {
      toast.error('Nom déjà utilisé', 'Choisissez un autre nom de table.')
      return
    }
    const nextSort =
      tables.reduce((max, table) => Math.max(max, table.sortOrder), -1) + 1
    setBusy(true)
    try {
      await db.diningTables.add({
        id: crypto.randomUUID(),
        storeId: activeStoreId,
        name: cleanName,
        capacity: cap,
        area: area.trim() || undefined,
        status: 'free',
        sortOrder: nextSort,
      })
      toast.success('Table ajoutée', cleanName)
      setName('')
      setCapacity('4')
      setArea('')
    } finally {
      setBusy(false)
    }
  }

  const seedTablesForCurrentStore = async (): Promise<void> => {
    if (!canManageTables) return
    const existingForStore = tables.length
    if (existingForStore > 0) return
    const batch: DiningTable[] = []
    for (let i = 1; i <= 8; i += 1) {
      batch.push({
        id: crypto.randomUUID(),
        storeId: activeStoreId,
        name: `Table ${i}`,
        capacity: i <= 4 ? 2 : 4,
        area: i <= 4 ? 'Salle' : 'Terrasse',
        status: 'free',
        sortOrder: i - 1,
      })
    }
    await db.diningTables.bulkAdd(batch)
    toast.success('Plan de salle initialisé', `${batch.length} tables ajoutées`)
    setStatusFilter('all')
  }

  const createReservation = async (): Promise<void> => {
    if (!canManageTables) return
    if (!selectedTableId) {
      toast.error('Table requise', 'Sélectionnez une table sur le plan de salle.')
      return
    }
    const customerName = resCustomerName.trim()
    const guests = Number.parseInt(resGuests.trim(), 10)
    const durationMin = Number.parseInt(resDurationMin.trim(), 10)
    const startAt = mergeDateTimeToTs(resDate, resTime)
    if (!customerName) {
      toast.error('Client requis', 'Renseignez le nom du client.')
      return
    }
    if (!Number.isFinite(guests) || guests <= 0 || guests > 30) {
      toast.error('Nombre de couverts invalide', 'Entrez une valeur entre 1 et 30.')
      return
    }
    if (!Number.isFinite(durationMin) || durationMin < 15 || durationMin > 360) {
      toast.error('Durée invalide', 'Utilisez une durée entre 15 et 360 minutes.')
      return
    }
    if (startAt == null) {
      toast.error('Date/heure invalides', 'Vérifiez la date et l’heure de réservation.')
      return
    }
    const endAt = startAt + durationMin * 60_000
    const overlap = reservations.some(
      (r) =>
        r.tableId === selectedTableId &&
        r.status !== 'cancelled' &&
        r.status !== 'completed' &&
        r.status !== 'no_show' &&
        startAt < r.endAt &&
        endAt > r.startAt,
    )
    if (overlap) {
      toast.error(
        'Conflit de réservation',
        'Cette table est déjà réservée sur ce créneau.',
      )
      return
    }

    setReservationBusy(true)
    try {
      const nowTs = Date.now()
      const status: TableReservationStatus = startAt <= nowTs ? 'confirmed' : 'pending'
      await db.transaction('rw', [db.tableReservations, db.diningTables], async () => {
        await db.tableReservations.add({
          id: crypto.randomUUID(),
          storeId: activeStoreId,
          tableId: selectedTableId,
          customerName,
          customerPhone: resPhone.trim() || undefined,
          guests,
          startAt,
          endAt,
          status,
          notes: resNotes.trim() || undefined,
          createdAt: nowTs,
          updatedAt: nowTs,
        })
        if (status === 'confirmed') {
          const table = await db.diningTables.get(selectedTableId)
          if (table && table.status === 'free') {
            await db.diningTables.update(selectedTableId, { status: 'reserved' })
          }
        }
      })
      toast.success('Réservation enregistrée', customerName)
      setResCustomerName('')
      setResPhone('')
      setResGuests('2')
      setResDurationMin('90')
      setResNotes('')
    } finally {
      setReservationBusy(false)
    }
  }

  const changeStatus = async (
    table: DiningTable,
    status: DiningTableStatus,
  ): Promise<void> => {
    if (!canManageTables) return
    const patch: Partial<DiningTable> = {
      status,
    }
    if (status === 'occupied') {
      patch.occupiedSince = Date.now()
    }
    if (status === 'free') {
      patch.occupiedSince = undefined
      patch.note = undefined
    }
    await db.diningTables.update(table.id, patch)
  }

  const updateReservationStatus = async (
    reservation: TableReservation,
    status: TableReservationStatus,
  ): Promise<void> => {
    if (!canManageTables) return
    await db.transaction('rw', [db.tableReservations, db.diningTables], async () => {
      await db.tableReservations.update(reservation.id, {
        status,
        updatedAt: Date.now(),
      })
      const table = await db.diningTables.get(reservation.tableId)
      if (!table) return
      if (status === 'confirmed' && table.status === 'free') {
        await db.diningTables.update(table.id, { status: 'reserved' })
      } else if (status === 'seated') {
        await db.diningTables.update(table.id, {
          status: 'occupied',
          occupiedSince: table.occupiedSince ?? Date.now(),
        })
      } else if (
        status === 'completed' ||
        status === 'cancelled' ||
        status === 'no_show'
      ) {
        await db.diningTables.update(table.id, {
          status: 'free',
          occupiedSince: undefined,
        })
      }
    })
  }

  const moveTable = async (table: DiningTable, direction: -1 | 1): Promise<void> => {
    if (!canManageTables) return
    const ordered = [...tables].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = ordered.findIndex((t) => t.id === table.id)
    if (idx < 0) return
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= ordered.length) return
    const other = ordered[swapIdx]
    await db.transaction('rw', db.diningTables, async () => {
      await db.diningTables.update(table.id, { sortOrder: other.sortOrder })
      await db.diningTables.update(other.id, { sortOrder: table.sortOrder })
    })
  }

  const deleteTable = async (table: DiningTable): Promise<void> => {
    if (!canManageTables) return
    if (table.status !== 'free') {
      toast.error(
        'Table occupée',
        'Libérez la table avant de la supprimer.',
      )
      return
    }
    const blocking = reservations.some(
      (r) =>
        r.tableId === table.id &&
        (r.status === 'pending' ||
          r.status === 'confirmed' ||
          r.status === 'seated'),
    )
    if (blocking) {
      toast.error(
        'Réservation en cours',
        'Annulez les réservations actives avant de supprimer la table.',
      )
      return
    }
    const ok = window.confirm(`Supprimer la table « ${table.name} » ?`)
    if (!ok) return
    await db.diningTables.delete(table.id)
    if (selectedTableId === table.id) setSelectedTableId('')
    toast.success('Table supprimée', table.name)
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconStore />}
        eyebrow="Salle"
        title="Tables"
        subtitle="Plan de salle interactif, suivi d’occupation et réservations clients"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Magasin actif"
          value={activeStoreLabel}
          tone="neutral"
          icon={<IconStore />}
        />
        <Kpi label="Libres" value={String(summary.free)} tone="accent" />
        <Kpi label="Occupées" value={String(summary.occupied)} tone="rose" />
        <Kpi label="Réservées" value={String(summary.reserved)} tone="amber" />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Réservations du jour"
          value={String(stats.todayReservations)}
          hint={`${stats.todayConfirmed} confirmées · ${stats.todayPending} en attente`}
          tone="accent"
          spark={stats.dailyTrend}
        />
        <Kpi
          label="No-show du jour"
          value={`${stats.noShowRate}%`}
          hint={`${stats.todayNoShow} absent(s) · ${stats.todayCancelled} annulée(s)`}
          tone={stats.noShowRate >= 20 ? 'rose' : 'amber'}
        />
        <Kpi
          label="Durée moyenne"
          value={
            stats.avgCurrentOccupancyMin > 0
              ? `${stats.avgCurrentOccupancyMin} min`
              : `${stats.avgPlannedDurationMin} min`
          }
          hint={
            stats.avgCurrentOccupancyMin > 0
              ? 'Occupation en cours'
              : 'Durée planifiée des réservations'
          }
          tone="violet"
        />
        <Kpi
          label="Rotation sur 7 jours"
          value={`${stats.weeklyTurnoverPerTable} / table`}
          hint={
            stats.peakHourCount > 0
              ? `Heure de pointe: ${stats.peakHourLabel} (${stats.peakHourCount})`
              : 'Aucune pointe détectée'
          }
          tone="sky"
        />
      </div>

      {canManageTables ? (
        <FormPanel
          eyebrow="Salle"
          title="Ajouter une table"
          description="Nom, capacité et zone de service."
          actions={
            <Button loading={busy} variant="accent" onClick={() => void createTable()}>
              Ajouter
            </Button>
          }
        >
          <FormGrid columns={3}>
            <Field label="Nom" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Table 9"
              />
            </Field>
            <Field label="Capacité" required>
              <Input
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
            <Field label="Zone">
              <Input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Terrasse"
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}

      <Card>
        <CardContent className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-end">
          <Field label="Filtrer par statut">
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | DiningTableStatus)
              }
            >
              <option value="all">Tous</option>
              <option value="free">Libres</option>
              <option value="occupied">Occupées</option>
              <option value="reserved">Réservées</option>
              <option value="cleaning">Nettoyage</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-zinc-900">
                Plan de salle interactif
              </h2>
              <Badge tone="neutral">{visibleTables.length} table(s)</Badge>
            </div>
            {visibleTables.length === 0 ? (
              tables.length === 0 ? (
                <div className="space-y-3">
                  <EmptyState
                    title="Aucune table dans ce magasin"
                    description="Ce magasin n’a pas encore de plan de salle."
                  />
                  {canManageTables ? (
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => void seedTablesForCurrentStore()}
                    >
                      Initialiser les tables
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <EmptyState
                    title="Aucune table visible"
                    description="Le filtre actuel masque toutes les tables."
                  />
                  <Button
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={() => setStatusFilter('all')}
                  >
                    Réinitialiser le filtre
                  </Button>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleTables.map((table) => {
                  const isSelected = table.id === selectedTableId
                  const activeReservation = activeReservationsByTable.get(table.id)
                  const tone = statusTone(table.status)
                  const classesByTone: Record<typeof tone, string> = {
                    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
                    warning: 'border-amber-200 bg-amber-50 text-amber-900',
                    danger: 'border-rose-200 bg-rose-50 text-rose-900',
                    neutral: 'border-zinc-200 bg-zinc-50 text-zinc-800',
                  }
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setSelectedTableId(table.id)}
                      className={`min-h-20 rounded-xl border px-3 py-2 text-left transition ${classesByTone[tone]} ${isSelected ? 'ring-2 ring-accent' : ''}`}
                    >
                      <p className="truncate text-[13px] font-semibold">{table.name}</p>
                      <p className="mt-0.5 text-[11px]">
                        {table.capacity} places
                        {table.area ? ` · ${table.area}` : ''}
                      </p>
                      <p className="mt-1 text-[11px] font-medium">
                        {STATUS_LABELS[table.status]}
                      </p>
                      {activeReservation ? (
                        <p className="mt-1 truncate text-[10px]">
                          Réservation: {activeReservation.customerName}
                        </p>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-[14px] font-semibold text-zinc-900">
              Suivi de l’occupation
            </h2>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="text-[11px] text-zinc-500">Taux d’occupation</p>
              <p className="text-lg font-bold text-zinc-900">{occupancyPct}%</p>
            </div>
            {tables.filter((t) => t.status === 'occupied').length === 0 ? (
              <p className="text-[12px] text-zinc-500">Aucune table occupée actuellement.</p>
            ) : (
              <div className="space-y-2">
                {tables
                  .filter((t) => t.status === 'occupied')
                  .sort((a, b) => (a.occupiedSince ?? 0) - (b.occupiedSince ?? 0))
                  .map((table) => (
                    <div
                      key={table.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 px-2.5 py-2 text-[12px]"
                    >
                      <span className="font-medium text-zinc-800">{table.name}</span>
                      <span className="text-zinc-600">
                        {table.occupiedSince
                          ? `Depuis ${formatDuration(Date.now() - table.occupiedSince)}`
                          : 'En cours'}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {canManageTables && selectedTable ? (
              <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                <p className="text-[12px] font-semibold text-zinc-800">
                  Gestion rapide: {selectedTable.name}
                </p>
                <Field label="Statut">
                  <Select
                    value={selectedTable.status}
                    onChange={(e) =>
                      void changeStatus(selectedTable, e.target.value as DiningTableStatus)
                    }
                  >
                    <option value="free">Libre</option>
                    <option value="occupied">Occupée</option>
                    <option value="reserved">Réservée</option>
                    <option value="cleaning">Nettoyage</option>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => void moveTable(selectedTable, -1)}
                  >
                    Monter
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => void moveTable(selectedTable, 1)}
                  >
                    Descendre
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  onClick={() => void deleteTable(selectedTable)}
                >
                  Supprimer la table
                </Button>
              </div>
            ) : null}
            {canManageTables ? (
              <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                <p className="text-[12px] font-semibold text-zinc-800">
                  Libération automatique
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_120px] sm:items-end">
                  <Field label="Activée">
                    <Select
                      value={autoReleaseEnabled ? 'on' : 'off'}
                      onChange={(e) => setAutoReleaseEnabled(e.target.value === 'on')}
                    >
                      <option value="on">Oui</option>
                      <option value="off">Non</option>
                    </Select>
                  </Field>
                  <Field label="Après (min)">
                    <Input
                      inputMode="numeric"
                      value={autoReleaseMinutes}
                      onChange={(e) => setAutoReleaseMinutes(e.target.value)}
                      disabled={!autoReleaseEnabled}
                    />
                  </Field>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Les tables occupées depuis plus longtemps que ce délai passent automatiquement en libre.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="mb-1 flex items-center gap-2">
            <IconUser className="h-4 w-4 text-zinc-500" />
            <h2 className="text-[14px] font-semibold text-zinc-900">
              Gestion des réservations clients
            </h2>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Client" required>
              <Input
                value={resCustomerName}
                onChange={(e) => setResCustomerName(e.target.value)}
                placeholder="Nom du client"
              />
            </Field>
            <Field label="Téléphone">
              <Input
                value={resPhone}
                onChange={(e) => setResPhone(e.target.value)}
                placeholder="Ex: 07 00 00 00 00"
              />
            </Field>
            <Field label="Table" required>
              <Select
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
              >
                <option value="">Sélectionner</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} ({table.capacity}p)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Couverts" required>
              <Input
                inputMode="numeric"
                value={resGuests}
                onChange={(e) => setResGuests(e.target.value)}
              />
            </Field>
            <Field label="Date" required>
              <Input
                type="date"
                value={resDate}
                onChange={(e) => setResDate(e.target.value)}
              />
            </Field>
            <Field label="Heure" required>
              <Input
                type="time"
                value={resTime}
                onChange={(e) => setResTime(e.target.value)}
              />
            </Field>
            <Field label="Durée (min)" required>
              <Input
                inputMode="numeric"
                value={resDurationMin}
                onChange={(e) => setResDurationMin(e.target.value)}
              />
            </Field>
            <Field label="Note">
              <Input
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                placeholder="Préférence, occasion, allergie..."
              />
            </Field>
          </div>
          {canManageTables ? (
            <div className="flex justify-stretch sm:justify-end">
              <Button
                loading={reservationBusy}
                variant="accent"
                className="w-full sm:w-auto"
                onClick={() => void createReservation()}
              >
                Créer la réservation
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[240px_1fr] sm:items-end">
            <Field label="Filtrer réservations">
              <Select
                value={reservationStatusFilter}
                onChange={(e) =>
                  setReservationStatusFilter(
                    e.target.value as 'all' | TableReservationStatus,
                  )
                }
              >
                <option value="all">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="confirmed">Confirmées</option>
                <option value="seated">Installées</option>
                <option value="completed">Terminées</option>
                <option value="cancelled">Annulées</option>
                <option value="no_show">Absents</option>
              </Select>
            </Field>
          </div>

          {upcomingReservations.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
              <p className="mb-2 text-[12px] font-medium text-zinc-700">
                Prochaines réservations
              </p>
              <div className="space-y-1.5">
                {upcomingReservations.map((r) => {
                  const tableName = tables.find((t) => t.id === r.tableId)?.name ?? 'Table'
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[12px]"
                    >
                      <span className="truncate text-zinc-800">
                        {new Date(r.startAt).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {tableName} · {r.customerName}
                      </span>
                      <Badge tone={reservationTone(r.status)}>
                        {RESERVATION_STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {visibleReservations.length === 0 ? (
            <EmptyState
              title="Aucune réservation"
              description="Aucune réservation ne correspond au filtre."
            />
          ) : (
            <div className="space-y-2">
              {visibleReservations.map((reservation) => {
                const tableName =
                  tables.find((t) => t.id === reservation.tableId)?.name ?? 'Table supprimée'
                return (
                  <div
                    key={reservation.id}
                    className="rounded-xl border border-zinc-200 bg-white p-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-zinc-900">
                          {reservation.customerName} · {tableName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-600">
                          {reservation.guests} couverts
                          {reservation.customerPhone ? ` · ${reservation.customerPhone}` : ''}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-600">
                          <IconClock className="h-3.5 w-3.5" />
                          {new Date(reservation.startAt).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}{' '}
                          —{' '}
                          {new Date(reservation.endAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <Badge tone={reservationTone(reservation.status)}>
                        {RESERVATION_STATUS_LABELS[reservation.status]}
                      </Badge>
                    </div>
                    {reservation.notes ? (
                      <p className="mt-2 rounded-md bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600">
                        Note: {reservation.notes}
                      </p>
                    ) : null}
                    {canManageTables ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            void updateReservationStatus(reservation, 'confirmed')
                          }
                        >
                          Confirmer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            void updateReservationStatus(reservation, 'seated')
                          }
                        >
                          Installer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            void updateReservationStatus(reservation, 'completed')
                          }
                        >
                          Terminer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            void updateReservationStatus(reservation, 'cancelled')
                          }
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={() => void updateReservationStatus(reservation, 'no_show')}
                        >
                          Absent
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
