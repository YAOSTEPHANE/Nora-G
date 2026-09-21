import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import {
  listActiveStaffProfiles,
  subscribeStaffProfiles,
} from '../auth/profiles'
import type { StaffProfile } from '../auth/types'
import { db } from '../db/db'
import type { AuditEvent } from '../db/types'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import {
  auditCategoryForKind,
  auditKindLabel,
  auditPayloadSummary,
  categoryTone,
  filterAuditEvents,
  INTERNAL_CONTROL_CATEGORY_LABELS,
  salesWithDiscountTrace,
  summarizeAuditEvents,
  type InternalControlCategory,
} from '../lib/internalControl'
import { filterSalesByPeriodDays } from '../lib/marginAnalytics'
import { formatFCFA } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Tabs } from '../ui/Tabs'
import {
  MobileDataCard,
  ResponsiveData,
  TableScrollHint,
} from '../ui/ResponsiveData'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { IconShield, IconDownload } from '../ui/icons'

type Period = 7 | 14 | 30 | 90 | 365

type TabId = 'journal' | 'remises' | 'vendeuses'

function fmtWhen(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ControleInterneView() {
  const [period, setPeriod] = useState<Period>(30)
  const [category, setCategory] = useState<InternalControlCategory>('all')
  const [actorId, setActorId] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabId>('journal')
  const [now, setNow] = useState(() => Date.now())
  const [profiles, setProfiles] = useState<StaffProfile[]>([])

  useEffect(() => {
    setNow(Date.now())
  }, [period])

  useEffect(() => {
    setProfiles(listActiveStaffProfiles())
    return subscribeStaffProfiles(() => {
      setProfiles(listActiveStaffProfiles())
    })
  }, [])

  const auditEvents =
    useLiveQuery(
      () => db.auditEvents.orderBy('createdAt').reverse().toArray(),
      [],
      [],
    ) ?? []
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []

  const sinceMs = now - period * 24 * 60 * 60 * 1000

  const periodEvents = useMemo(
    () => auditEvents.filter((e) => e.createdAt >= sinceMs && e.createdAt <= now),
    [auditEvents, sinceMs, now],
  )

  const filtered = useMemo(
    () =>
      filterAuditEvents({
        events: periodEvents,
        category,
        actorId,
        query,
        sinceMs,
        untilMs: now,
      }),
    [periodEvents, category, actorId, query, sinceMs, now],
  )

  const totals = useMemo(
    () => summarizeAuditEvents(periodEvents),
    [periodEvents],
  )

  const rangeSales = useMemo(
    () => filterSalesByPeriodDays(sales, period, now),
    [sales, period, now],
  )

  const discountSales = useMemo(
    () => salesWithDiscountTrace(rangeSales),
    [rangeSales],
  )

  const actorOptions = useMemo(() => {
    const fromAudit = totals.byActor
    const ids = new Set(fromAudit.map((a) => a.actorId))
    const extra = profiles
      .filter((p) => !ids.has(p.id))
      .map((p) => ({
        actorId: p.id,
        displayName: p.displayName,
        count: 0,
      }))
    return [...fromAudit, ...extra]
  }, [totals.byActor, profiles])

  const exportCsv = () => {
    const rows: string[][] = [
      ['Date', 'Type', 'Acteur', 'Motif', 'Détail', 'Vente liée'],
      ...filtered.map((ev) => [
        new Date(ev.createdAt).toISOString(),
        auditKindLabel(ev.kind),
        ev.actorDisplayName,
        ev.reason,
        auditPayloadSummary(ev) ?? '',
        ev.relatedSaleId ?? '',
      ]),
    ]
    downloadTextFile(
      `controle-interne-${period}j.csv`,
      toCsvSemicolon(rows),
    )
  }

  return (
    <div className="module-page space-y-6">
      <PageHeader
        icon={<IconShield />}
        title="Contrôle interne"
        subtitle="Traçabilité des remises, annulations, retours, prix, stock et actions vendeuses"
        actions={
          <Button
            type="button"
            variant="secondary"
            iconLeft={<IconDownload />}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Événements" value={String(totals.total)} tone="accent" />
        <Kpi label="Remises" value={String(totals.remises)} tone="amber" />
        <Kpi
          label="Annulations"
          value={String(totals.annulations)}
          tone="rose"
        />
        <Kpi label="Retours" value={String(totals.retours)} tone="sky" />
        <Kpi label="Prix" value={String(totals.prix)} tone="violet" />
        <Kpi label="Stock" value={String(totals.stock)} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Période">
          <Select
            value={String(period)}
            onChange={(e) => setPeriod(Number(e.target.value) as Period)}
          >
            <option value="7">7 jours</option>
            <option value="14">14 jours</option>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
            <option value="365">12 mois</option>
          </Select>
        </Field>
        <Field label="Catégorie">
          <Select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as InternalControlCategory)
            }
          >
            {(
              Object.keys(
                INTERNAL_CONTROL_CATEGORY_LABELS,
              ) as InternalControlCategory[]
            ).map((k) => (
              <option key={k} value={k}>
                {INTERNAL_CONTROL_CATEGORY_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendeuse / acteur">
          <Select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
          >
            <option value="all">Tous</option>
            {actorOptions.map((a) => (
              <option key={a.actorId} value={a.actorId}>
                {a.displayName}
                {a.count > 0 ? ` (${a.count})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Recherche" className="min-w-[12rem] flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Motif, produit, code…"
          />
        </Field>
      </div>

      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'journal', label: 'Journal audit', count: filtered.length || undefined },
          {
            id: 'remises',
            label: 'Remises tickets',
            count: discountSales.length || undefined,
          },
          {
            id: 'vendeuses',
            label: 'Par vendeuse',
            count: totals.byActor.length || undefined,
          },
        ]}
      />

      {tab === 'journal' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Journal append-only"
            subtitle="Horodaté, non modifiable — source de vérité du contrôle interne"
          />
          {filtered.length === 0 ? (
            <EmptyState
              title="Aucun événement"
              description="Élargissez la période ou changez les filtres."
            />
          ) : (
            <>
              <TableScrollHint />
              <ResponsiveData
                table={
                  <Table minWidth={880}>
                    <THead>
                      <Tr hover={false}>
                        <Th>Quand</Th>
                        <Th>Type</Th>
                        <Th>Acteur</Th>
                        <Th>Motif / détail</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {filtered.slice(0, 200).map((ev) => (
                        <AuditRow key={ev.id} ev={ev} />
                      ))}
                    </TBody>
                  </Table>
                }
                cards={
                  <ul className="grid gap-2">
                    {filtered.slice(0, 80).map((ev) => {
                      const cat = auditCategoryForKind(ev.kind)
                      const detail = auditPayloadSummary(ev)
                      return (
                        <MobileDataCard
                          key={ev.id}
                          title={auditKindLabel(ev.kind)}
                          meta={`${fmtWhen(ev.createdAt)} · ${ev.actorDisplayName}`}
                          body={
                            <>
                              <Badge tone={categoryTone(cat)}>
                                {auditKindLabel(ev.kind)}
                              </Badge>
                              <p className="mt-2">{ev.reason}</p>
                              {detail ? (
                                <p className="mt-1 text-zinc-500">{detail}</p>
                              ) : null}
                            </>
                          }
                        />
                      )
                    })}
                  </ul>
                }
              />
            </>
          )}
        </div>
      ) : null}

      {tab === 'remises' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Tickets avec remise"
            subtitle="Complément du journal : remises et codes promo appliqués en caisse"
          />
          {discountSales.length === 0 ? (
            <EmptyState title="Aucune remise sur la période" />
          ) : (
            <>
              <TableScrollHint />
              <ResponsiveData
                table={
                  <Table minWidth={720}>
                    <THead>
                      <Tr hover={false}>
                        <Th>Quand</Th>
                        <Th>Vendeuse</Th>
                        <Th align="right">Remise %</Th>
                        <Th align="right">Montant remisé</Th>
                        <Th align="right">Ticket</Th>
                        <Th>Promo</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {discountSales.slice(0, 150).map((s) => (
                        <Tr key={s.id}>
                          <Td mono>{fmtWhen(s.createdAt)}</Td>
                          <Td className="font-medium">{s.actorDisplayName}</Td>
                          <Td align="right" mono>
                            {s.discountPct > 0 ? `${s.discountPct} %` : '—'}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(s.discountTTC)}
                          </Td>
                          <Td align="right" mono>
                            {formatFCFA(s.totalTTC)}
                          </Td>
                          <Td className="font-mono text-xs">
                            {s.promoCode ?? '—'}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                }
                cards={
                  <ul className="grid gap-2">
                    {discountSales.slice(0, 60).map((s) => (
                      <MobileDataCard
                        key={s.id}
                        title={s.actorDisplayName}
                        meta={fmtWhen(s.createdAt)}
                        body={
                          <p>
                            Remise {s.discountPct > 0 ? `${s.discountPct} %` : ''}{' '}
                            · {formatFCFA(s.discountTTC)} sur ticket{' '}
                            {formatFCFA(s.totalTTC)}
                            {s.promoCode ? ` · ${s.promoCode}` : ''}
                          </p>
                        }
                      />
                    ))}
                  </ul>
                }
              />
            </>
          )}
        </div>
      ) : null}

      {tab === 'vendeuses' ? (
        <div className="space-y-4">
          <SectionHeader
            title="Actions par vendeuse"
            subtitle="Volume d’événements de contrôle attribués à chaque profil"
          />
          {totals.byActor.length === 0 ? (
            <EmptyState title="Aucune action tracée" />
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {totals.byActor.map((a) => {
                const actorEvents = periodEvents.filter(
                  (e) => e.actorProfileId === a.actorId,
                )
                const sub = summarizeAuditEvents(actorEvents)
                return (
                  <li
                    key={a.actorId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium text-zinc-900">
                        {a.displayName}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {sub.remises} remise(s) · {sub.annulations} annulation(s)
                        · {sub.retours} retour(s) · {sub.prix} prix · {sub.stock}{' '}
                        stock
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="accent">{a.count} action(s)</Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setActorId(a.actorId)
                          setCategory('all')
                          setTab('journal')
                        }}
                      >
                        Voir
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function AuditRow({ ev }: { ev: AuditEvent }) {
  const cat = auditCategoryForKind(ev.kind)
  const detail = auditPayloadSummary(ev)
  return (
    <Tr>
      <Td mono className="whitespace-nowrap">
        {fmtWhen(ev.createdAt)}
      </Td>
      <Td>
        <Badge tone={categoryTone(cat)}>{auditKindLabel(ev.kind)}</Badge>
      </Td>
      <Td className="font-medium">{ev.actorDisplayName}</Td>
      <Td>
        <p className="text-zinc-800">{ev.reason}</p>
        {detail ? (
          <p className="text-xs text-zinc-500">{detail}</p>
        ) : null}
        {ev.relatedSaleId ? (
          <p className="font-mono text-[10px] text-zinc-400">
            vente {ev.relatedSaleId.slice(0, 8)}…
          </p>
        ) : null}
      </Td>
    </Tr>
  )
}
