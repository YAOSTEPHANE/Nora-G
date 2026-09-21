import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import {
  effectivePermissions,
  ROLE_DEFAULT_PERMISSIONS,
} from '../auth/permissions'
import {
  isCustomStaffProfile,
  listActiveStaffProfiles,
  staffRoleLabel,
  subscribeStaffProfiles,
  updateStaffProfile,
} from '../auth/profiles'
import type { StaffPermissions, StaffProfile } from '../auth/types'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { SalespersonGoal, StaffCommission } from '../db/types'
import { formatFCFA } from '../lib/money'
import {
  aggregateSalespersonPerformance,
  currentMonthBounds,
  evaluateGoals,
  filterSalesForPeriod,
  teamPerfTotals,
} from '../lib/salespersonStats'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import {
  MobileDataCard,
  ResponsiveData,
  TableScrollHint,
} from '../ui/ResponsiveData'
import { useToast } from '../ui/Toast'
import { IconPersonnel, IconShield, IconStar, IconCash } from '../ui/icons'
import { cn } from '../ui/cn'

type Props = {
  canManage: boolean
  canManageRights: boolean
  actor: { id: string; displayName: string }
}

type TabId = 'perf' | 'objectifs' | 'commissions' | 'droits'
type Period = 7 | 14 | 30 | 90

const RIGHT_TOGGLES: Array<{
  key: keyof StaffPermissions
  label: string
}> = [
  { key: 'canProcessRefunds', label: 'Retours / remboursements' },
  { key: 'canViewJournalReport', label: 'Journal & reçus' },
  { key: 'canViewAnalytique', label: 'Stats / analytique' },
  { key: 'canSwitchStore', label: 'Changer de boutique' },
  { key: 'canDailyClosure', label: 'Clôture journalière' },
  { key: 'canManageStocks', label: 'Inventaire / stocks' },
]

export function VendeusesView({
  canManage,
  canManageRights,
  actor,
}: Props) {
  const toast = useToast()
  const { activeStoreId, activeStore } = useActiveStore()
  const [tab, setTab] = useState<TabId>('perf')
  const [period, setPeriod] = useState<Period>(30)
  const [storeScope, setStoreScope] = useState<'active' | 'all'>('active')
  const [now] = useState(Date.now)
  const [profiles, setProfiles] = useState(() => listActiveStaffProfiles())
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeStaffProfiles(() => {
    setProfiles(listActiveStaffProfiles())
  }), [])

  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []
  const refunds = useLiveQuery(() => db.refunds.toArray(), [], []) ?? []
  const commissions =
    useLiveQuery(() => db.staffCommissions.toArray(), [], []) ?? []
  const goals =
    useLiveQuery(
      () => db.salespersonGoals.orderBy('periodStartYmd').reverse().toArray(),
      [],
      [],
    ) ?? []
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []

  const sellerProfiles = useMemo(
    () =>
      profiles.filter(
        (p) => p.role === 'caissier' || p.role === 'gerant' || p.role === 'admin',
      ),
    [profiles],
  )

  const rangeSales = useMemo(() => {
    let list = filterSalesForPeriod(sales, period, now)
    if (storeScope === 'active') {
      list = list.filter((s) => s.storeId === activeStoreId)
    }
    return list
  }, [sales, period, now, storeScope, activeStoreId])

  const storeCommissions = useMemo(
    () =>
      storeScope === 'active'
        ? commissions.filter((c) => c.storeId === activeStoreId)
        : commissions,
    [commissions, storeScope, activeStoreId],
  )

  const perfRows = useMemo(
    () =>
      aggregateSalespersonPerformance({
        sales: rangeSales,
        refunds,
        commissions: storeCommissions,
        profiles: sellerProfiles,
      }),
    [rangeSales, refunds, storeCommissions, sellerProfiles],
  )

  const totals = useMemo(() => teamPerfTotals(perfRows), [perfRows])

  const goalProgress = useMemo(
    () => evaluateGoals({ goals, sales }),
    [goals, sales],
  )

  // —— Objectifs form ——
  const month = currentMonthBounds(now)
  const [goalProfileId, setGoalProfileId] = useState('')
  const [goalStart, setGoalStart] = useState(month.startYmd)
  const [goalEnd, setGoalEnd] = useState(month.endYmd)
  const [goalCa, setGoalCa] = useState('')
  const [goalSales, setGoalSales] = useState('')
  const [goalRate, setGoalRate] = useState('5')
  const [goalNotes, setGoalNotes] = useState('')
  const [goalStoreOnly, setGoalStoreOnly] = useState(true)

  // —— Commission form ——
  const [cProfileId, setCProfileId] = useState('')
  const [cLabel, setCLabel] = useState('')
  const [cAmount, setCAmount] = useState('')
  const [cRate, setCRate] = useState('5')

  // —— Droits ——
  const [rightsProfileId, setRightsProfileId] = useState('')
  const rightsProfile = sellerProfiles.find((p) => p.id === rightsProfileId)
  const rightsPerms = rightsProfile
    ? effectivePermissions(rightsProfile)
    : null

  const saveGoal = async () => {
    if (!canManage) return
    const profile = sellerProfiles.find((p) => p.id === goalProfileId)
    if (!profile) return toast.error('Vendeuse', 'Choisissez un profil.')
    const targetCaTTC = Math.round(Number(goalCa.replace(/\s/g, '')))
    if (!Number.isFinite(targetCaTTC) || targetCaTTC <= 0) {
      return toast.error('Objectif CA invalide')
    }
    const targetSalesCount = goalSales.trim()
      ? Math.round(Number(goalSales))
      : undefined
    const commissionRatePct = Number(goalRate.replace(',', '.'))
    setBusy(true)
    try {
      const row: SalespersonGoal = {
        id: crypto.randomUUID(),
        staffProfileId: profile.id,
        staffDisplayName: profile.displayName,
        storeId: goalStoreOnly ? activeStoreId : undefined,
        storeName: goalStoreOnly ? activeStore?.name : undefined,
        periodKind: 'custom',
        periodStartYmd: goalStart,
        periodEndYmd: goalEnd,
        targetCaTTC,
        targetSalesCount:
          targetSalesCount != null && Number.isFinite(targetSalesCount)
            ? targetSalesCount
            : undefined,
        commissionRatePct: Number.isFinite(commissionRatePct)
          ? commissionRatePct
          : undefined,
        notes: goalNotes.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
      }
      await db.salespersonGoals.add(row)
      setGoalCa('')
      setGoalSales('')
      setGoalNotes('')
      toast.success('Objectif enregistré', profile.displayName)
    } finally {
      setBusy(false)
    }
  }

  const deleteGoal = async (id: string) => {
    if (!canManage) return
    await db.salespersonGoals.delete(id)
    toast.info('Objectif supprimé')
  }

  const createCommission = async () => {
    if (!canManage) return
    const profile = sellerProfiles.find((p) => p.id === cProfileId)
    if (!profile) return toast.error('Vendeuse requise')
    if (!cLabel.trim()) return toast.error('Libellé vente requis')
    const amountTTC = Math.round(Number(cAmount.replace(/\s/g, '')))
    const rate = Number(cRate.replace(',', '.'))
    if (!Number.isFinite(amountTTC) || amountTTC <= 0) {
      return toast.error('Montant invalide')
    }
    if (!Number.isFinite(rate) || rate < 0) {
      return toast.error('Taux invalide')
    }
    const commissionTTC = Math.round((amountTTC * rate) / 100)
    const row: StaffCommission = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      staffName: profile.displayName,
      staffProfileId: profile.id,
      saleLabel: cLabel.trim(),
      amountTTC,
      ratePct: rate,
      commissionTTC,
      status: 'accrued',
      createdAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.staffCommissions.add(row)
    setCLabel('')
    setCAmount('')
    toast.success('Commission provisionnée', formatFCFA(commissionTTC))
  }

  const payCommission = async (id: string) => {
    if (!canManage) return
    await db.staffCommissions.update(id, {
      status: 'paid',
      paidAt: Date.now(),
    })
    toast.success('Commission versée')
  }

  const provisionFromGoal = async (gp: (typeof goalProgress)[number]) => {
    if (!canManage || gp.suggestedCommissionTTC <= 0) return
    const row: StaffCommission = {
      id: crypto.randomUUID(),
      storeId: gp.goal.storeId ?? activeStoreId,
      staffName: gp.goal.staffDisplayName,
      staffProfileId: gp.goal.staffProfileId,
      saleLabel: `Objectif ${gp.goal.periodStartYmd} → ${gp.goal.periodEndYmd}`,
      amountTTC: gp.caNetTTC,
      ratePct: gp.goal.commissionRatePct ?? 0,
      commissionTTC: gp.suggestedCommissionTTC,
      status: 'accrued',
      createdAt: Date.now(),
      createdByProfileId: actor.id,
      createdByDisplayName: actor.displayName,
    }
    await db.staffCommissions.add(row)
    toast.success(
      'Commission proposée',
      formatFCFA(gp.suggestedCommissionTTC),
    )
    setTab('commissions')
  }

  const patchRight = (
    profile: StaffProfile,
    key: keyof StaffPermissions,
    value: boolean | number,
  ) => {
    if (!canManageRights) return
    if (!isCustomStaffProfile(profile.id)) {
      toast.error(
        'Profil démo',
        'Créez un utilisateur dans Équipe pour modifier les droits.',
      )
      return
    }
    const overrides: Partial<StaffPermissions> = {
      ...profile.permissionOverrides,
      [key]: value,
    }
    const roleDefault = ROLE_DEFAULT_PERMISSIONS[profile.role][key]
    if (overrides[key] === roleDefault) {
      delete overrides[key]
    }
    try {
      updateStaffProfile(profile.id, {
        permissionOverrides:
          Object.keys(overrides).length > 0 ? overrides : null,
      })
      setProfiles(listActiveStaffProfiles())
      toast.success('Droit mis à jour', profile.displayName)
    } catch (e) {
      toast.error(
        'Échec',
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  const setMaxDiscount = (profile: StaffProfile, raw: string) => {
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error('Remise max entre 0 et 100 %')
      return
    }
    patchRight(profile, 'maxDiscountPct', Math.round(n * 10) / 10)
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconPersonnel />}
        eyebrow={
          storeScope === 'active'
            ? `Boutique · ${activeStore?.name ?? '—'}`
            : 'Réseau'
        }
        title="Gestion des vendeuses"
        subtitle="CA, panier moyen, remises, retours, objectifs, commissions et droits d’accès"
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label="Période" className="sm:w-36">
          <Select
            value={String(period)}
            onChange={(e) => setPeriod(Number(e.target.value) as Period)}
          >
            <option value="7">7 jours</option>
            <option value="14">14 jours</option>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
          </Select>
        </Field>
        <Field label="Périmètre" className="sm:w-44">
          <Select
            value={storeScope}
            onChange={(e) =>
              setStoreScope(e.target.value === 'all' ? 'all' : 'active')
            }
          >
            <option value="active">Boutique active</option>
            <option value="all">Tout le réseau</option>
          </Select>
        </Field>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Ventes" value={String(totals.salesCount)} tone="accent" />
        <Kpi label="CA net" value={formatFCFA(totals.caNetTTC)} tone="violet" />
        <Kpi
          label="Remises"
          value={formatFCFA(totals.discountTTC)}
          tone="amber"
        />
        <Kpi
          label="Retours"
          value={formatFCFA(totals.refundTTC)}
          tone="rose"
        />
        <Kpi
          label="Commissions dues"
          value={formatFCFA(totals.commissionDueTTC)}
          tone="sky"
        />
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'perf', label: 'Performance', count: perfRows.length || undefined },
          { id: 'objectifs', label: 'Objectifs', count: goals.length || undefined },
          {
            id: 'commissions',
            label: 'Commissions',
            count: storeCommissions.length || undefined,
          },
          { id: 'droits', label: 'Droits d’accès' },
        ]}
      />

      {tab === 'perf' ? (
        <div className="space-y-4">
          <SectionHeader
            title="CA par vendeuse"
            subtitle="Panier moyen, remises accordées et retours sur la période"
          />
          {perfRows.length === 0 ? (
            <EmptyState
              title="Aucune activité"
              description="Les ventes avec caissière renseignée apparaîtront ici."
            />
          ) : (
            <div className="min-w-0">
              <TableScrollHint />
              <ResponsiveData
                table={
                  <Table minWidth={900}>
                    <THead>
                      <Tr hover={false}>
                        <Th sticky>Vendeuse</Th>
                        <Th align="right">Ventes</Th>
                        <Th align="right">CA net</Th>
                        <Th align="right" hideBelow="md">
                          Panier moy.
                        </Th>
                        <Th align="right" hideBelow="lg">
                          Remises
                        </Th>
                        <Th align="right" hideBelow="lg">
                          Retours
                        </Th>
                        <Th align="right" hideBelow="xl">
                          Comm. dues
                        </Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {perfRows.map((r) => (
                        <Tr key={r.key}>
                          <Td sticky className="font-medium text-zinc-900">
                            {r.displayName}
                            {r.discountedSalesCount > 0 ? (
                              <span className="block text-[10px] font-normal text-zinc-400">
                                {r.discountedSalesCount} vente(s) avec remise
                              </span>
                            ) : null}
                          </Td>
                          <Td align="right" mono>
                            {r.salesCount}
                          </Td>
                          <Td align="right" mono className="font-semibold">
                            {formatFCFA(r.caNetTTC)}
                          </Td>
                          <Td align="right" mono hideBelow="md">
                            {formatFCFA(r.avgBasketTTC)}
                          </Td>
                          <Td align="right" mono hideBelow="lg">
                            {r.discountTTC > 0
                              ? formatFCFA(r.discountTTC)
                              : '—'}
                          </Td>
                          <Td
                            align="right"
                            mono
                            hideBelow="lg"
                            className={
                              r.refundTTC > 0 ? 'text-rose-600' : undefined
                            }
                          >
                            {r.refundTTC > 0
                              ? formatFCFA(r.refundTTC)
                              : '—'}
                          </Td>
                          <Td align="right" mono hideBelow="xl">
                            {r.commissionAccruedTTC > 0
                              ? formatFCFA(r.commissionAccruedTTC)
                              : '—'}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                }
                cards={
                  <ul className="grid gap-2">
                    {perfRows.map((r) => (
                      <MobileDataCard
                        key={r.key}
                        title={r.displayName}
                        body={
                          <div className="space-y-1 text-[12px]">
                            <p>
                              {r.salesCount} vente(s) · CA{' '}
                              {formatFCFA(r.caNetTTC)}
                            </p>
                            <p>Panier moy. {formatFCFA(r.avgBasketTTC)}</p>
                            <p>
                              Remises {formatFCFA(r.discountTTC)} · Retours{' '}
                              {formatFCFA(r.refundTTC)}
                            </p>
                          </div>
                        }
                      />
                    ))}
                  </ul>
                }
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === 'objectifs' ? (
        <div className="space-y-4">
          {canManage ? (
            <FormPanel
              eyebrow="Objectifs"
              title="Fixer un objectif"
              description="CA cible, volume de ventes et taux de commission suggéré."
              actions={
                <Button
                  variant="accent"
                  loading={busy}
                  iconLeft={<IconStar />}
                  onClick={() => void saveGoal()}
                >
                  Enregistrer
                </Button>
              }
            >
              <FormGrid columns={3}>
                <Field label="Vendeuse" required>
                  <Select
                    value={goalProfileId}
                    onChange={(e) => setGoalProfileId(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {sellerProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} ({staffRoleLabel(p)})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Début">
                  <Input
                    type="date"
                    value={goalStart}
                    onChange={(e) => setGoalStart(e.target.value)}
                  />
                </Field>
                <Field label="Fin">
                  <Input
                    type="date"
                    value={goalEnd}
                    onChange={(e) => setGoalEnd(e.target.value)}
                  />
                </Field>
                <Field label="Objectif CA TTC" required>
                  <Input
                    inputMode="numeric"
                    value={goalCa}
                    onChange={(e) => setGoalCa(e.target.value)}
                    className="font-mono-nums"
                    placeholder="ex. 500000"
                  />
                </Field>
                <Field label="Objectif nb ventes">
                  <Input
                    inputMode="numeric"
                    value={goalSales}
                    onChange={(e) => setGoalSales(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
                <Field label="Taux commission %">
                  <Input
                    inputMode="decimal"
                    value={goalRate}
                    onChange={(e) => setGoalRate(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
              </FormGrid>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <input
                    type="checkbox"
                    checked={goalStoreOnly}
                    onChange={(e) => setGoalStoreOnly(e.target.checked)}
                  />
                  Limiter à la boutique active
                </label>
              </div>
              <Field label="Notes" className="mt-3">
                <Textarea
                  rows={2}
                  value={goalNotes}
                  onChange={(e) => setGoalNotes(e.target.value)}
                />
              </Field>
            </FormPanel>
          ) : null}

          <SectionHeader title="Suivi des objectifs" />
          {goalProgress.length === 0 ? (
            <EmptyState
              title="Aucun objectif"
              description="Définissez un objectif mensuel ou hebdomadaire par vendeuse."
              variant="flat"
            />
          ) : (
            <ul className="space-y-3">
              {goalProgress.map((gp) => {
                const caPct = gp.caProgressPct ?? 0
                return (
                  <li
                    key={gp.goal.id}
                    className="rounded-xl border border-border bg-white p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">
                          {gp.goal.staffDisplayName}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {gp.goal.periodStartYmd} → {gp.goal.periodEndYmd}
                          {gp.goal.storeName
                            ? ` · ${gp.goal.storeName}`
                            : ' · Réseau'}
                        </p>
                      </div>
                      <Badge
                        tone={
                          caPct >= 100
                            ? 'success'
                            : caPct >= 70
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {gp.caProgressPct != null
                          ? `${gp.caProgressPct} % CA`
                          : '—'}
                      </Badge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          caPct >= 100 ? 'bg-emerald-500' : 'bg-[#0033aa]',
                        )}
                        style={{ width: `${Math.min(100, caPct)}%` }}
                      />
                    </div>
                    <div className="mt-2 grid gap-1 text-[12px] text-ink-muted sm:grid-cols-3">
                      <p>
                        CA {formatFCFA(gp.caNetTTC)} /{' '}
                        {formatFCFA(gp.goal.targetCaTTC)}
                      </p>
                      <p>
                        Ventes {gp.salesCount}
                        {gp.goal.targetSalesCount != null
                          ? ` / ${gp.goal.targetSalesCount}`
                          : ''}
                        {gp.salesProgressPct != null
                          ? ` (${gp.salesProgressPct} %)`
                          : ''}
                      </p>
                      <p>
                        Comm. suggérée{' '}
                        {formatFCFA(gp.suggestedCommissionTTC)}
                        {gp.goal.commissionRatePct != null
                          ? ` (${gp.goal.commissionRatePct} %)`
                          : ''}
                      </p>
                    </div>
                    {canManage ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {gp.suggestedCommissionTTC > 0 ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void provisionFromGoal(gp)}
                          >
                            Provisionner commission
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void deleteGoal(gp.goal.id)}
                        >
                          Supprimer
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'commissions' ? (
        <div className="space-y-4">
          {canManage ? (
            <FormPanel
              eyebrow="Commissions"
              title="Provisionner"
              description="Rattachez la commission au profil vendeuse."
              actions={
                <Button
                  variant="accent"
                  iconLeft={<IconCash />}
                  onClick={() => void createCommission()}
                >
                  Provisionner
                </Button>
              }
            >
              <FormGrid columns={4}>
                <Field label="Vendeuse" required>
                  <Select
                    value={cProfileId}
                    onChange={(e) => setCProfileId(e.target.value)}
                  >
                    <option value="">—</option>
                    {sellerProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Vente / dossier" required>
                  <Input
                    value={cLabel}
                    onChange={(e) => setCLabel(e.target.value)}
                  />
                </Field>
                <Field label="Base CA TTC">
                  <Input
                    value={cAmount}
                    onChange={(e) => setCAmount(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
                <Field label="Taux %">
                  <Input
                    value={cRate}
                    onChange={(e) => setCRate(e.target.value)}
                    className="font-mono-nums"
                  />
                </Field>
              </FormGrid>
            </FormPanel>
          ) : null}

          {storeCommissions.length === 0 ? (
            <EmptyState
              title="Aucune commission"
              description="Provisionnez depuis un objectif ou manuellement."
            />
          ) : (
            <ul className="space-y-2">
              {[...storeCommissions]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2"
                  >
                    <div>
                      <p className="text-[13px] font-semibold">
                        {r.staffName} · {formatFCFA(r.commissionTTC)}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {r.saleLabel} · {r.ratePct}% sur{' '}
                        {formatFCFA(r.amountTTC)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={r.status === 'paid' ? 'success' : 'warning'}
                      >
                        {r.status === 'paid' ? 'Versée' : 'Due'}
                      </Badge>
                      {canManage && r.status === 'accrued' ? (
                        <Button
                          size="sm"
                          onClick={() => void payCommission(r.id)}
                        >
                          Verser
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'droits' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Droits d’accès vendeuses"
            subtitle="Remise max, retours, journal — affinés sans quitter cet écran"
          />
          <Field label="Profil" className="max-w-sm">
            <Select
              value={rightsProfileId}
              onChange={(e) => setRightsProfileId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {sellerProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} · {staffRoleLabel(p)}
                </option>
              ))}
            </Select>
          </Field>

          {!rightsProfile || !rightsPerms ? (
            <EmptyState
              title="Sélectionnez une vendeuse"
              description="Les droits effectifs (rôle + surcharges) s’affichent ici."
              variant="flat"
            />
          ) : (
            <div className="rounded-xl border border-border bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <IconShield className="h-4 w-4 text-zinc-500" />
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {rightsProfile.displayName}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {staffRoleLabel(rightsProfile)}
                    {rightsProfile.storeId
                      ? ` · magasin ${stores.find((s) => s.id === rightsProfile.storeId)?.name ?? rightsProfile.storeId}`
                      : ''}
                  </p>
                </div>
              </div>

              <Field label="Remise panier max (%)" className="mb-4 max-w-[200px]">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={rightsPerms.maxDiscountPct}
                  key={`${rightsProfile.id}-${rightsPerms.maxDiscountPct}`}
                  disabled={!canManageRights}
                  className="font-mono-nums"
                  onBlur={(e) =>
                    setMaxDiscount(rightsProfile, e.target.value)
                  }
                />
              </Field>

              <ul className="divide-y divide-border/70">
                {RIGHT_TOGGLES.map(({ key, label }) => {
                  const on = Boolean(rightsPerms[key])
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 py-2.5 text-[13px]"
                    >
                      <span className="text-ink">{label}</span>
                      <div className="flex items-center gap-2">
                        <Badge tone={on ? 'success' : 'neutral'}>
                          {on ? 'Autorisé' : 'Refusé'}
                        </Badge>
                        {canManageRights ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              patchRight(rightsProfile, key, !on)
                            }
                          >
                            {on ? 'Retirer' : 'Accorder'}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {!canManageRights ? (
                <p className="mt-3 text-[11px] text-ink-subtle">
                  Modification réservée aux administrateurs (droits équipe).
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
