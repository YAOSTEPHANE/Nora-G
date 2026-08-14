import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import type { CrmInteractionKind } from '../db/types'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import { formatFCFA } from '../lib/money'
import {
  customerCreditAvailable,
  customerCreditBalance,
  customerCreditLimit,
  recordCustomerCreditPayment,
  setCustomerCreditLimit,
} from '../lib/customerCredit'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader } from '../ui/Card'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader } from '../ui/PageHeader'
import { IconUser } from '../ui/icons'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { MobileDataCard, ResponsiveData } from '../ui/ResponsiveData'
import { useToast } from '../ui/Toast'
import { saleNetTTC } from '../lib/refundMath'

type Props = {
  actor: { id: string; displayName: string }
}

export function CrmView({ actor }: Props) {
  const toast = useToast()
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [kind, setKind] = useState<CrmInteractionKind>('call')
  const [note, setNote] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [creditLimitEdit, setCreditLimitEdit] = useState('')
  const [creditPayEdit, setCreditPayEdit] = useState('')
  const [now] = useState(Date.now)

  const customers = useLiveQuery(() => db.loyaltyCustomers.orderBy('updatedAt').reverse().toArray(), [], []) ?? []
  const interactions = useLiveQuery(() => db.crmInteractions.orderBy('createdAt').reverse().limit(400).toArray(), [], []) ?? []
  const sales = useLiveQuery(() => db.sales.toArray(), [], []) ?? []

  const crmRows = useMemo(() => {
    return customers
      .filter((c) => !c.archived)
      .map((c) => {
        const customerSales = sales.filter((s) => s.loyaltyCustomerId === c.id || s.loyaltyCustomerPhone === c.phone)
        const totalSpent = customerSales.reduce((sum, s) => sum + saleNetTTC(s), 0)
        const lastSaleAt = customerSales.reduce((m, s) => Math.max(m, s.createdAt), 0)
        const lastInteractionAt = interactions
          .filter((i) => i.customerId === c.id)
          .reduce((m, i) => Math.max(m, i.createdAt), 0)
        return {
          id: c.id,
          name: c.displayName || 'Client',
          phone: c.phone,
          points: c.points,
          visits: c.visitCount,
          totalSpent,
          lastSaleAt,
          lastInteractionAt,
          creditBalance: customerCreditBalance(c),
          creditLimit: customerCreditLimit(c),
          creditAvailable: customerCreditAvailable(c),
        }
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
  }, [customers, sales, interactions])

  const overdueFollowups = useMemo(() => {
    return interactions.filter((i) => i.nextActionAt != null && i.nextActionAt < now).length
  }, [interactions, now])

  const addInteraction = async (): Promise<void> => {
    const customer = customers.find((c) => c.id === selectedCustomerId)
    if (!customer) {
      toast.error('Sélectionnez un client')
      return
    }
    if (!note.trim()) {
      toast.error('Ajoutez une note')
      return
    }
    await db.crmInteractions.add({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      customerId: customer.id,
      customerPhone: customer.phone,
      customerName: customer.displayName,
      kind,
      note: note.trim(),
      nextActionAt: nextActionDate ? new Date(`${nextActionDate}T08:00:00`).getTime() : undefined,
      actorProfileId: actor.id,
      actorDisplayName: actor.displayName,
    })
    setNote('')
    setNextActionDate('')
    toast.success('Interaction CRM enregistrée')
  }

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId)

  const saveCreditLimit = async (): Promise<void> => {
    if (!selectedCustomer) {
      toast.error('Sélectionnez un client')
      return
    }
    const n = Number.parseInt(creditLimitEdit.replace(/\s/g, ''), 10)
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Plafond invalide')
      return
    }
    await setCustomerCreditLimit(selectedCustomer.id, n)
    setCreditLimitEdit('')
    toast.success('Plafond crédit mis à jour', formatFCFA(n))
  }

  const payCredit = async (): Promise<void> => {
    if (!selectedCustomer) {
      toast.error('Sélectionnez un client')
      return
    }
    const n = Number.parseInt(creditPayEdit.replace(/\s/g, ''), 10)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Montant invalide')
      return
    }
    try {
      await recordCustomerCreditPayment({
        customerId: selectedCustomer.id,
        amountTTC: n,
        actor: { profileId: actor.id, displayName: actor.displayName },
      })
      setCreditPayEdit('')
      toast.success('Règlement encours enregistré', formatFCFA(n))
    } catch (e) {
      toast.error(
        'Échec',
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  const exportCrmCsv = (): void => {
    const rows: string[][] = [
      ['Clients'],
      ['Client', 'Téléphone', 'Visites', 'Points', 'CA net'],
      ...crmRows.map((r) => [r.name, r.phone, String(r.visits), String(r.points), String(r.totalSpent)]),
      [],
      ['Date', 'Client', 'Canal', 'Note', 'Prochaine action', 'Agent'],
      ...interactions.map((i) => [
        new Date(i.createdAt).toLocaleString('fr-FR'),
        i.customerName ?? i.customerPhone,
        i.kind,
        i.note,
        i.nextActionAt ? new Date(i.nextActionAt).toLocaleDateString('fr-FR') : '',
        i.actorDisplayName ?? '',
      ]),
    ]
    downloadTextFile('crm-clients.csv', toCsvSemicolon(rows))
    toast.success('Export CRM généré')
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconUser />}
        eyebrow="Relation client"
        title="Clients"
        subtitle="Segmentation, interactions et plan de relance"
        actions={
          <Button variant="secondary" className="w-full sm:w-auto" onClick={exportCrmCsv}>
            Export CRM
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Clients fidélité" value={String(customers.length)} tone="accent" />
        <Kpi label="Interactions CRM" value={String(interactions.length)} tone="neutral" />
        <Kpi label="Relances en retard" value={String(overdueFollowups)} tone="amber" />
      </div>

      <FormPanel
        eyebrow="Crédit"
        title="Compte client"
        description="Plafond d’encours et règlements (vente à crédit en caisse)."
        actions={
          <>
            <Button variant="secondary" onClick={() => void saveCreditLimit()}>
              Enregistrer plafond
            </Button>
            <Button variant="accent" onClick={() => void payCredit()}>
              Enregistrer règlement
            </Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Client">
            <Select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="">Sélectionner</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.displayName || 'Client')} · {c.phone}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-2xl border border-[rgba(0,51,170,0.1)] bg-[#f7f8fc] px-3.5 py-3 text-[12px] text-ink-muted">
            {selectedCustomer ? (
              <>
                Encours {formatFCFA(customerCreditBalance(selectedCustomer))} ·
                Plafond {formatFCFA(customerCreditLimit(selectedCustomer))} ·
                Dispo {formatFCFA(customerCreditAvailable(selectedCustomer))}
              </>
            ) : (
              'Sélectionnez un client pour gérer le crédit.'
            )}
          </div>
          <Field label="Nouveau plafond (FCFA)">
            <Input
              inputMode="numeric"
              value={creditLimitEdit}
              onChange={(e) => setCreditLimitEdit(e.target.value)}
              className="font-mono-nums"
              placeholder="ex. 100000"
            />
          </Field>
          <Field label="Règlement encours (FCFA)">
            <Input
              inputMode="numeric"
              value={creditPayEdit}
              onChange={(e) => setCreditPayEdit(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
        </FormGrid>
      </FormPanel>

      <FormPanel
        eyebrow="Saisie"
        title="Nouvelle interaction"
        description="Enregistrez un appel, un message ou une relance."
        actions={
          <Button variant="accent" onClick={() => void addInteraction()}>
            Ajouter interaction
          </Button>
        }
      >
        <FormGrid>
          <Field label="Client">
            <Select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="">Sélectionner</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.displayName || 'Client')} · {c.phone}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Canal">
            <Select value={kind} onChange={(e) => setKind(e.target.value as CrmInteractionKind)}>
              <option value="call">Appel</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="visit">Visite</option>
              <option value="note">Note interne</option>
            </Select>
          </Field>
          <Field label="Prochaine action">
            <Input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: client intéressé par lot boisson, rappel vendredi..." />
          </Field>
        </FormGrid>
      </FormPanel>

      <Card>
        <CardHeader title="Portefeuille clients" subtitle="Segmentation et prochaines actions" />
        <CardContent>
          {crmRows.length === 0 ? (
            <EmptyState title="Aucun client CRM" description="Les clients du programme fidélité apparaîtront ici." variant="flat" />
          ) : (
            <ResponsiveData
              table={
                <Table minWidth={900}>
                  <THead>
                    <Tr hover={false}>
                      <Th sticky>Client</Th>
                      <Th>Téléphone</Th>
                      <Th align="right" hideBelow="lg">
                        Visites
                      </Th>
                      <Th align="right" hideBelow="lg">
                        Points
                      </Th>
                      <Th align="right">CA net</Th>
                      <Th align="right" hideBelow="lg">
                        Encours
                      </Th>
                      <Th hideBelow="xl">Dernier achat</Th>
                      <Th hideBelow="xl">Dernière interaction</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {crmRows.map((r) => (
                      <Tr key={r.id}>
                        <Td sticky>{r.name}</Td>
                        <Td mono>{r.phone}</Td>
                        <Td align="right" mono hideBelow="lg">
                          {r.visits}
                        </Td>
                        <Td align="right" mono hideBelow="lg">
                          {r.points}
                        </Td>
                        <Td align="right" mono className="font-semibold">
                          {formatFCFA(r.totalSpent)}
                        </Td>
                        <Td align="right" mono hideBelow="lg">
                          {formatFCFA(r.creditBalance)}
                        </Td>
                        <Td hideBelow="xl">
                          {r.lastSaleAt
                            ? new Date(r.lastSaleAt).toLocaleDateString('fr-FR')
                            : '—'}
                        </Td>
                        <Td hideBelow="xl">
                          {r.lastInteractionAt
                            ? new Date(r.lastInteractionAt).toLocaleDateString('fr-FR')
                            : '—'}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              }
              cards={
                <ul className="grid gap-2">
                  {crmRows.map((r) => (
                    <MobileDataCard
                      key={r.id}
                      title={r.name}
                      meta={
                        <span className="font-mono-nums">{r.phone}</span>
                      }
                      body={
                        <div className="grid grid-cols-2 gap-1.5">
                          <span>Visites : {r.visits}</span>
                          <span>Points : {r.points}</span>
                          <span className="col-span-2 font-semibold text-ink">
                            CA net : {formatFCFA(r.totalSpent)}
                          </span>
                          <span className="col-span-2 text-[11px]">
                            Dernier achat :{' '}
                            {r.lastSaleAt
                              ? new Date(r.lastSaleAt).toLocaleDateString('fr-FR')
                              : '—'}
                          </span>
                          <span className="col-span-2 text-[11px]">
                            Dernière interaction :{' '}
                            {r.lastInteractionAt
                              ? new Date(r.lastInteractionAt).toLocaleDateString(
                                  'fr-FR',
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
    </div>
  )
}
