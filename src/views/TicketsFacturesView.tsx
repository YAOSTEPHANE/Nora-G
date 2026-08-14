import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import type {
  Sale,
  SaleLine,
  TicketInvoice,
  TicketInvoiceKind,
  TicketInvoiceStatus,
} from '../db/types'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import { appendAuditEvent } from '../lib/auditLog'
import { DEFAULT_VAT_RATE_PCT, formatFCFA, totalsFromLinesTTC } from '../lib/money'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconDownload, IconPrinter, IconReceipt, IconSearch } from '../ui/icons'

type Props = {
  activeStoreId: string
  activeStoreLabel: string
  actor: { id: string; displayName: string }
  canViewAllDocuments: boolean
  onViewReceipt: (doc: TicketInvoice) => void
  onPrintReceipt: (doc: TicketInvoice) => void
}

type DraftLine = {
  name: string
  qty: string
  unitPriceTTC: string
  vatRatePct: string
}

type ViewTab = 'create' | 'history' | 'ventes'
type KindFilter = 'all' | TicketInvoiceKind

function statusTone(
  s: TicketInvoiceStatus,
): 'neutral' | 'warning' | 'success' | 'danger' {
  if (s === 'draft') return 'neutral'
  if (s === 'issued') return 'warning'
  if (s === 'paid') return 'success'
  return 'danger'
}

function statusLabel(s: TicketInvoiceStatus): string {
  if (s === 'draft') return 'Brouillon'
  if (s === 'issued') return 'Émise'
  if (s === 'paid') return 'Réglée'
  return 'Annulée'
}

function kindLabel(k: TicketInvoiceKind): string {
  return k === 'ticket' ? 'Ticket' : 'Facture'
}

function nextReference(kind: TicketInvoiceKind): string {
  const prefix = kind === 'ticket' ? 'TIC' : 'FAC'
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`
}

export function TicketsFacturesView({
  activeStoreId,
  activeStoreLabel,
  actor,
  canViewAllDocuments,
  onViewReceipt,
  onPrintReceipt,
}: Props) {
  const toast = useToast()
  const rows =
    useLiveQuery(
      async () => {
        const all = await db.ticketInvoices.toArray()
        return all
          .filter((r) => !r.storeId || r.storeId === activeStoreId)
          .sort((a, b) => b.createdAt - a.createdAt)
      },
      [activeStoreId],
      [],
    ) ?? []
  const sales =
    useLiveQuery(
      async () => {
        const all = await db.sales.toArray()
        return all
          .filter((s) => !s.storeId || s.storeId === activeStoreId)
          .sort((a, b) => b.createdAt - a.createdAt)
      },
      [activeStoreId],
      [],
    ) ?? []

  const [kind, setKind] = useState<TicketInvoiceKind>('ticket')
  const [viewTab, setViewTab] = useState<ViewTab>('history')
  const [filterKind, setFilterKind] = useState<KindFilter>('all')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | TicketInvoiceStatus>('all')
  const [search, setSearch] = useState('')
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<TicketInvoiceStatus | null>(null)
  const [pendingDeleteDraftId, setPendingDeleteDraftId] = useState<string | null>(null)
  const [pendingDeleteUntil, setPendingDeleteUntil] = useState<number>(0)
  const [now] = useState(Date.now)
  const [lines, setLines] = useState<DraftLine[]>([
    { name: '', qty: '1', unitPriceTTC: '', vatRatePct: String(DEFAULT_VAT_RATE_PCT) },
  ])

  useEffect(() => {
    if (sales.length === 0) return
    let cancelled = false
    const syncSalesIntoTicketInvoices = async () => {
      try {
        const existing = await db.ticketInvoices.toArray()
        const linkedSaleIds = new Set(
          existing.map((r) => r.linkedSaleId).filter((id): id is string => Boolean(id)),
        )
        const missingSales = sales.filter((sale) => !linkedSaleIds.has(sale.id))
        if (missingSales.length === 0 || cancelled) return
        const docs = missingSales.map((sale) =>
          saleToTicketInvoice(sale, activeStoreLabel),
        )
        if (!cancelled && docs.length > 0) {
          await db.ticketInvoices.bulkAdd(docs)
        }
      } catch (error) {
        if (cancelled) return
        toast.error(
          'Synchronisation tickets/factures incomplète',
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    void syncSalesIntoTicketInvoices()
    return () => {
      cancelled = true
    }
  }, [sales, activeStoreLabel, toast])

  const normalizedLines = useMemo(() => {
    return lines
      .map((l) => {
        const qty = Number.parseInt(l.qty.trim(), 10)
        const price = Number.parseInt(l.unitPriceTTC.trim(), 10)
        const vat = Number.parseInt(l.vatRatePct.trim(), 10)
        return {
          name: l.name.trim(),
          qty: Number.isFinite(qty) ? qty : 0,
          unitPriceTTC: Number.isFinite(price) ? price : 0,
          vatRatePct: Number.isFinite(vat) ? vat : DEFAULT_VAT_RATE_PCT,
        }
      })
      .filter((l) => l.name && l.qty > 0 && l.unitPriceTTC > 0)
  }, [lines])

  const totals = useMemo(() => {
    return totalsFromLinesTTC(normalizedLines, 0)
  }, [normalizedLines])

  const scopedRows = useMemo(() => {
    if (canViewAllDocuments) return rows
    return rows.filter(
      (r) => !r.createdByProfileId || r.createdByProfileId === actor.id,
    )
  }, [rows, canViewAllDocuments, actor.id])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base =
      filterStatus === 'all'
        ? scopedRows
        : scopedRows.filter((r) => r.status === filterStatus)
    if (filterKind !== 'all') {
      base = base.filter((r) => r.kind === filterKind)
    }
    if (!q) return base
    return base.filter((r) => {
      if (r.reference.toLowerCase().includes(q)) return true
      if ((r.customerName ?? '').toLowerCase().includes(q)) return true
      if ((r.customerPhone ?? '').toLowerCase().includes(q)) return true
      return false
    })
  }, [scopedRows, filterStatus, filterKind, search])

  const linkedSaleIds = useMemo(
    () =>
      new Set(
        scopedRows
          .map((r) => r.linkedSaleId)
          .filter((id): id is string => Boolean(id)),
      ),
    [scopedRows],
  )

  const recentSales = useMemo(() => {
    return sales
      .filter((s) => !linkedSaleIds.has(s.id))
      .slice(0, 40)
  }, [sales, linkedSaleIds])

  const kpis = useMemo(() => {
    const issued = scopedRows.filter((r) => r.status === 'issued')
    const paid = scopedRows.filter((r) => r.status === 'paid')
    const drafts = scopedRows.filter((r) => r.status === 'draft')
    const overdue = issued.filter((r) => r.dueAt != null && r.dueAt < now)
    return {
      issuedCount: issued.length,
      unpaidAmount: issued.reduce((s, r) => s + r.totalTTC, 0),
      paidAmount: paid.reduce((s, r) => s + r.totalTTC, 0),
      draftCount: drafts.length,
      overdueCount: overdue.length,
      totalDocs: scopedRows.length,
    }
  }, [scopedRows, now])

  const saveDraft = async () => {
    try {
      if (normalizedLines.length === 0) {
        toast.error('Aucune ligne', 'Ajoutez au moins un article valide.')
        return
      }
      const now = Date.now()
      const saleLines: SaleLine[] = normalizedLines.map((l, idx) => ({
        productId: `manual-${idx}`,
        name: l.name,
        qty: l.qty,
        unitPriceTTC: l.unitPriceTTC,
        vatRatePct: l.vatRatePct,
      }))
      const payload: TicketInvoice = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        reference: nextReference(kind),
        kind,
        status: 'draft',
        storeId: activeStoreId,
        storeName: activeStoreLabel,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).getTime() : undefined,
        currency: 'XOF',
        lines: saleLines,
        subtotalHT: totals.subtotalHT,
        tva: totals.tva,
        totalTTC: totals.totalTTC,
        createdByProfileId: actor.id,
        createdByDisplayName: actor.displayName,
        updatedByProfileId: actor.id,
        updatedByDisplayName: actor.displayName,
      }
      if (editingId) {
        const existing = rows.find((r) => r.id === editingId)
        const updatedRow: TicketInvoice = {
          ...payload,
          id: editingId,
          reference: existing?.reference ?? payload.reference,
          createdAt: existing?.createdAt ?? now,
          status: existing?.status ?? editingStatus ?? 'draft',
          issuedAt: existing?.issuedAt,
          paidAt: existing?.paidAt,
          linkedSaleId: existing?.linkedSaleId,
          updatedByProfileId: actor.id,
          updatedByDisplayName: actor.displayName,
        }
        await db.ticketInvoices.put(updatedRow)
        if (updatedRow.linkedSaleId) {
          await db.sales.update(updatedRow.linkedSaleId, {
            lines: updatedRow.lines,
            subtotalHT: updatedRow.subtotalHT,
            tva: updatedRow.tva,
            totalTTC: updatedRow.totalTTC,
          })
        }
        if (existing) {
          await appendAuditEvent({
            kind: 'ticket_invoice_updated',
            actor: { profileId: actor.id, displayName: actor.displayName },
            reason: `Modification ${updatedRow.kind === 'ticket' ? 'du reçu' : 'du document'} ${updatedRow.reference}`,
            payload: {
              ticketInvoiceId: updatedRow.id,
              reference: updatedRow.reference,
              kind: updatedRow.kind,
              statusBefore: existing.status,
              statusAfter: updatedRow.status,
              totalBefore: existing.totalTTC,
              totalAfter: updatedRow.totalTTC,
              linesBefore: existing.lines,
              linesAfter: updatedRow.lines,
              customerBefore: {
                name: existing.customerName,
                phone: existing.customerPhone,
                dueAt: existing.dueAt,
              },
              customerAfter: {
                name: updatedRow.customerName,
                phone: updatedRow.customerPhone,
                dueAt: updatedRow.dueAt,
              },
            },
          })
        }
        toast.success(
          kind === 'ticket' ? 'Reçu mis à jour' : 'Document mis à jour',
        )
      } else {
        await db.ticketInvoices.add(payload)
        toast.success(`${kindLabel(kind)} enregistre`, payload.reference)
      }
      setEditingId(null)
      setEditingStatus(null)
      setCustomerName('')
      setCustomerPhone('')
      setDueAt('')
      setNotes('')
      setLines([{ name: '', qty: '1', unitPriceTTC: '', vatRatePct: String(DEFAULT_VAT_RATE_PCT) }])
    } catch (e) {
      toast.error(
        'Modification impossible',
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  const updateStatus = async (row: TicketInvoice, status: TicketInvoiceStatus) => {
    const isOwn = row.createdByProfileId === actor.id
    if (!canViewAllDocuments && !isOwn) return
    const now = new Date().getTime()
    const patch: Partial<TicketInvoice> = { status, updatedAt: now }
    if (status === 'issued') patch.issuedAt = now
    if (status === 'paid') patch.paidAt = now
    await db.ticketInvoices.update(row.id, patch)
  }

  const duplicateDocument = async (row: TicketInvoice) => {
    const isOwn = row.createdByProfileId === actor.id
    if (!canViewAllDocuments && !isOwn) return
    const now = new Date().getTime()
    const payload: TicketInvoice = {
      ...row,
      id: crypto.randomUUID(),
      reference: nextReference(row.kind),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      issuedAt: undefined,
      paidAt: undefined,
      linkedSaleId: undefined,
    }
    await db.ticketInvoices.add(payload)
    toast.success('Document duplique', payload.reference)
  }

  const deleteDraft = async (row: TicketInvoice) => {
    const isOwn = row.createdByProfileId === actor.id
    if (!canViewAllDocuments && !isOwn) return
    if (row.status !== 'draft') return
    const now = new Date().getTime()
    if (pendingDeleteDraftId !== row.id || now > pendingDeleteUntil) {
      setPendingDeleteDraftId(row.id)
      setPendingDeleteUntil(now + 7000)
      toast.warning(
        'Confirmer la suppression',
        `Cliquez encore sur "Supprimer" pour ${row.reference} (7s).`,
      )
      return
    }
    await db.ticketInvoices.delete(row.id)
    if (selectedDetailId === row.id) setSelectedDetailId(null)
    setPendingDeleteDraftId(null)
    setPendingDeleteUntil(0)
    toast.info('Brouillon supprimé')
  }

  const startEditDocument = (row: TicketInvoice) => {
    const isOwn = row.createdByProfileId === actor.id
    if (!canViewAllDocuments && !isOwn) return
    if (row.status === 'cancelled') return
    setViewTab('create')
    setEditingId(row.id)
    setEditingStatus(row.status)
    setKind(row.kind)
    setCustomerName(row.customerName ?? '')
    setCustomerPhone(row.customerPhone ?? '')
    setDueAt(row.dueAt ? new Date(row.dueAt).toISOString().slice(0, 10) : '')
    setNotes(row.notes ?? '')
    setLines(
      row.lines.map((line) => ({
        name: line.name,
        qty: String(line.qty),
        unitPriceTTC: String(line.unitPriceTTC),
        vatRatePct: String(line.vatRatePct ?? DEFAULT_VAT_RATE_PCT),
      })),
    )
  }

  const exportDocsCsv = () => {
    const rowsCsv: string[][] = [
      ['Reference', 'Type', 'Client', 'Telephone', 'Montant TTC', 'Statut', 'Date creation', 'Echeance'],
      ...visibleRows.map((r) => [
        r.reference,
        kindLabel(r.kind),
        r.customerName ?? '',
        r.customerPhone ?? '',
        String(r.totalTTC),
        statusLabel(r.status),
        new Date(r.createdAt).toLocaleString('fr-FR'),
        r.dueAt ? new Date(r.dueAt).toLocaleDateString('fr-FR') : '',
      ]),
    ]
    downloadTextFile(
      `tickets-factures-${activeStoreId}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsvSemicolon(rowsCsv),
    )
    toast.success('Export tickets/factures prêt')
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconReceipt />}
        eyebrow="Facturation"
        title="Factures"
        subtitle={
          canViewAllDocuments
            ? `Création, émission, suivi des paiements — ${activeStoreLabel}`
            : `Vos documents — ${activeStoreLabel}`
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            iconLeft={<IconDownload />}
            onClick={exportDocsCsv}
          >
            Export CSV
          </Button>
        }
      />

      <div className="catalogue-hero p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Documents"
            value={String(kpis.totalDocs)}
            hint={`${kpis.draftCount} brouillon(s)`}
            tone="neutral"
            icon={<IconReceipt />}
          />
          <Kpi
            label="À encaisser"
            value={formatFCFA(kpis.unpaidAmount)}
            hint={`${kpis.issuedCount} émis · ${kpis.overdueCount} en retard`}
            tone="amber"
          />
          <Kpi
            label="Réglé"
            value={formatFCFA(kpis.paidAmount)}
            tone="accent"
          />
          <Kpi
            label="Brouillons"
            value={String(kpis.draftCount)}
            tone="violet"
          />
        </div>
      </div>

      <Tabs
        variant="segmented"
        active={viewTab}
        onChange={setViewTab}
        items={[
          { id: 'history', label: 'Historique', count: visibleRows.length },
          { id: 'create', label: 'Nouveau document' },
          {
            id: 'ventes',
            label: 'Ventes caisse',
            count: recentSales.length > 0 ? recentSales.length : undefined,
          },
        ]}
      />

      {viewTab === 'create' ? (
      <FormPanel
        eyebrow="Document"
        title={editingId ? 'Modifier le document' : 'Nouveau document'}
        description="Ticket ou facture, client et lignes de facturation."
        actions={
          <>
            <Button variant="accent" onClick={() => void saveDraft()}>
              {editingId ? 'Mettre à jour' : 'Enregistrer brouillon'}
            </Button>
            {editingId ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingId(null)
                  setEditingStatus(null)
                  setCustomerName('')
                  setCustomerPhone('')
                  setDueAt('')
                  setNotes('')
                  setLines([
                    {
                      name: '',
                      qty: '1',
                      unitPriceTTC: '',
                      vatRatePct: String(DEFAULT_VAT_RATE_PCT),
                    },
                  ])
                }}
              >
                Annuler édition
              </Button>
            ) : null}
          </>
        }
      >
        <FormGrid columns={3}>
          <Field label="Type">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as TicketInvoiceKind)}
              disabled={editingId != null}
            >
              <option value="ticket">Ticket</option>
              <option value="facture">Facture</option>
            </Select>
          </Field>
          <Field label="Client">
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom client" />
          </Field>
          <Field label="Telephone">
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="07..." />
          </Field>
          <Field label="Échéance (optionnel)">
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <Field label="Note" className="lg:col-span-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, détails…" />
          </Field>
        </FormGrid>
        <div className="mt-5 space-y-3">
          <header className="ui-form-section-head">
            <h4>Lignes</h4>
          </header>
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-12"
            >
              <Input
                className="sm:col-span-2 md:col-span-5"
                value={line.name}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, name: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Article/service"
              />
              <Input
                className="md:col-span-2"
                inputMode="numeric"
                value={line.qty}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, qty: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Qte"
              />
              <Input
                className="md:col-span-3"
                inputMode="numeric"
                value={line.unitPriceTTC}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, unitPriceTTC: e.target.value } : r,
                    ),
                  )
                }
                placeholder="Prix TTC"
              />
              <div className="flex items-stretch gap-2 sm:col-span-2 md:col-span-2">
                <Input
                  className="min-w-0 flex-1"
                  inputMode="numeric"
                  value={line.vatRatePct}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, vatRatePct: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="TVA %"
                />
                <Button
                  variant="ghost"
                  className="min-h-11 min-w-11 shrink-0"
                  onClick={() =>
                    setLines((prev) => prev.filter((_, i) => i !== idx))
                  }
                  disabled={lines.length <= 1}
                >
                  -
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="secondary" onClick={() => setLines((prev) => [...prev, { name: '', qty: '1', unitPriceTTC: '', vatRatePct: String(DEFAULT_VAT_RATE_PCT) }])}>
              Ajouter ligne
            </Button>
            <span className="rounded-xl border border-[rgba(0,51,170,0.12)] bg-[#f7f8fc] px-3 py-2 text-sm text-ink-muted">
              Total: <strong className="font-mono-nums text-ink">{formatFCFA(totals.totalTTC)}</strong>
            </span>
          </div>
        </div>
      </FormPanel>
      ) : null}

      {viewTab === 'ventes' ? (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-[12px] text-zinc-600">
              Ventes caisse récentes sans document lié (synchronisation automatique en arrière-plan).
            </p>
            {recentSales.length === 0 ? (
              <EmptyState
                title="Aucune vente en attente"
                description="Toutes les ventes sont déjà associées à un ticket."
                variant="flat"
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recentSales.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[12px]"
                  >
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {sale.tableName ? `Table ${sale.tableName}` : 'Client comptoir'}
                      </p>
                      <p className="text-zinc-500">
                        {new Date(sale.createdAt).toLocaleString('fr-FR')} ·{' '}
                        {sale.cashierDisplayName ?? '—'}
                      </p>
                    </div>
                    <span className="font-mono-nums font-bold text-[var(--color-caisse-gold)]">
                      {formatFCFA(sale.totalTTC)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {viewTab === 'history' ? (
      <Card>
        <CardContent className="space-y-3">
          <div className="catalogue-filter-bar space-y-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Référence, client, téléphone…"
                iconLeft={<IconSearch />}
                className="flex-1"
              />
              <Select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as KindFilter)}
                className="w-full sm:w-[160px]"
              >
                <option value="all">Tous types</option>
                <option value="ticket">Tickets</option>
                <option value="facture">Factures</option>
              </Select>
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | TicketInvoiceStatus)}
                className="w-full sm:w-[180px]"
              >
                <option value="all">Tous statuts</option>
                <option value="draft">Brouillon</option>
                <option value="issued">Émise</option>
                <option value="paid">Réglée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </div>
          </div>
          {visibleRows.length === 0 ? (
            <EmptyState title="Aucun document" description="Créez votre premier ticket ou facture." variant="flat" />
          ) : (
            <>
            <div className="hidden md:block">
            <Table minWidth={980}>
              <THead>
                <Tr hover={false}>
                  <Th>Référence</Th>
                  <Th>Type</Th>
                  <Th>Client</Th>
                  <Th align="right">Montant TTC</Th>
                  <Th>Statut</Th>
                  <Th>Date</Th>
                  <Th align="right">Actions</Th>
                </Tr>
              </THead>
              <TBody>
                {visibleRows.map((row) => (
                  <Tr key={row.id}>
                    <Td mono>{row.reference}</Td>
                    <Td>{kindLabel(row.kind)}</Td>
                    <Td>
                      <span className="inline-flex items-center gap-1.5">
                        <span>{row.customerName ?? 'Client comptoir'}</span>
                        {!row.createdByProfileId ? (
                          <Badge tone="warning">Ancien</Badge>
                        ) : null}
                      </span>
                    </Td>
                    <Td align="right" mono>{formatFCFA(row.totalTTC)}</Td>
                    <Td><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></Td>
                    <Td mono>{new Date(row.createdAt).toLocaleDateString('fr-FR')}</Td>
                    <Td align="right">
                      <div className="grid grid-cols-1 gap-1.5 sm:flex sm:flex-wrap sm:justify-end">
                        {row.status === 'draft' ? (
                          <Button size="sm" className="w-full sm:w-auto" variant="secondary" onClick={() => void updateStatus(row, 'issued')}>Émettre</Button>
                        ) : null}
                        {row.status === 'draft' ? (
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            variant="ghost"
                            onClick={() => startEditDocument(row)}
                          >
                            Modifier
                          </Button>
                        ) : null}
                        {row.kind === 'ticket' && row.status !== 'cancelled' ? (
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            variant="ghost"
                            onClick={() => startEditDocument(row)}
                          >
                            Modifier reçu
                          </Button>
                        ) : null}
                        {row.status !== 'paid' && row.status !== 'cancelled' ? (
                          <Button size="sm" className="w-full sm:w-auto" variant="accent" onClick={() => void updateStatus(row, 'paid')}>Réglée</Button>
                        ) : null}
                        {row.status !== 'cancelled' ? (
                          <Button size="sm" className="w-full sm:w-auto" variant="ghost" onClick={() => void updateStatus(row, 'cancelled')}>Annuler</Button>
                        ) : null}
                        <Button
                          size="sm"
                          className="w-full sm:w-auto"
                          variant="ghost"
                          onClick={() =>
                            setSelectedDetailId((prev) => (prev === row.id ? null : row.id))
                          }
                        >
                          Détails
                        </Button>
                        <Button
                          size="sm"
                          className="w-full sm:w-auto"
                          variant="ghost"
                          onClick={() => void duplicateDocument(row)}
                        >
                          Dupliquer
                        </Button>
                        <Button
                          size="sm"
                          className="w-full sm:w-auto"
                          variant="ghost"
                          onClick={() => onViewReceipt(row)}
                        >
                          Reçu
                        </Button>
                        <Button
                          size="sm"
                          className="w-full sm:w-auto"
                          variant="ghost"
                          iconLeft={<IconPrinter />}
                          onClick={() => onPrintReceipt(row)}
                        >
                          Imprimer
                        </Button>
                        {row.status === 'draft' ? (
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            variant="ghost"
                            onClick={() => void deleteDraft(row)}
                          >
                            Supprimer
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            </div>

            <ul className="grid gap-2 md:hidden">
              {visibleRows.map((row) => (
                <li key={row.id} className="catalogue-cat-row p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono-nums text-[12px] font-semibold text-zinc-900">{row.reference}</p>
                      <p className="text-[11px] text-zinc-600">{row.customerName ?? 'Client comptoir'}</p>
                    </div>
                    <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-500">{kindLabel(row.kind)}</span>
                    <span className="font-mono-nums font-bold text-[var(--color-caisse-gold)]">
                      {formatFCFA(row.totalTTC)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onViewReceipt(row)}>Reçu</Button>
                    <Button size="sm" variant="ghost" onClick={() => onPrintReceipt(row)} iconLeft={<IconPrinter />}>
                      Impr.
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
          {selectedDetailId ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-[12px]">
              {(() => {
                const row = visibleRows.find((r) => r.id === selectedDetailId)
                if (!row) return <p>Aucun détail.</p>
                return (
                  <div className="space-y-1.5">
                    <p className="font-semibold text-zinc-900">{row.reference}</p>
                    {row.lines.map((line, idx) => (
                      <p key={`${row.id}-${idx}`} className="text-zinc-700">
                        {line.name} · {line.qty} x {formatFCFA(line.unitPriceTTC)}
                      </p>
                    ))}
                    {row.notes ? <p className="text-zinc-600">Note: {row.notes}</p> : null}
                  </div>
                )
              })()}
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}
    </div>
  )
}

function saleToTicketInvoice(sale: Sale, fallbackStoreLabel: string): TicketInvoice {
  const ymd = new Date(sale.createdAt).toISOString().slice(0, 10).replace(/-/g, '')
  return {
    id: crypto.randomUUID(),
    createdAt: sale.createdAt,
    updatedAt: sale.createdAt,
    reference: `TIC-${ymd}-${sale.id.slice(0, 4).toUpperCase()}`,
    kind: 'ticket',
    status: 'paid',
    storeId: sale.storeId,
    storeName: sale.storeName ?? fallbackStoreLabel,
    customerName: sale.tableName ? `Table ${sale.tableName}` : 'Client comptoir',
    currency: 'XOF',
    lines: sale.lines,
    subtotalHT: sale.subtotalHT,
    tva: sale.tva,
    totalTTC: sale.totalTTC,
    linkedSaleId: sale.id,
    createdByProfileId: sale.cashierProfileId,
    createdByDisplayName: sale.cashierDisplayName,
    updatedByProfileId: sale.cashierProfileId,
    updatedByDisplayName: sale.cashierDisplayName,
    issuedAt: sale.createdAt,
    paidAt: sale.createdAt,
  }
}

