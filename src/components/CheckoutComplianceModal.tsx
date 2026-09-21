import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db/db'
import type {
  CartLine,
  LotAllocation,
  Prescription,
  ProductWithStock,
} from '../db/types'
import {
  allocateLotsFEFO,
  lotExpiryStatus,
} from '../lib/productTracking'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { cn } from '../ui/cn'

export type PrescriptionDraft = Pick<
  Prescription,
  | 'patientName'
  | 'patientPhone'
  | 'prescriberName'
  | 'prescriptionNumber'
  | 'issuedAt'
  | 'notes'
  | 'mutuelleName'
  | 'mutuelleCoveragePct'
  | 'mutuelleAmountTTC'
>

export type CheckoutLineMeta = {
  productId: string
  lotAllocations?: LotAllocation[]
  serialUnitIds?: string[]
  serialNumbers?: string[]
  imeiNumbers?: string[]
  variantId?: string
}

export type CheckoutComplianceResult = {
  lineMeta: CheckoutLineMeta[]
  prescription?: PrescriptionDraft
}

type Props = {
  cart: CartLine[]
  products: ProductWithStock[]
  storeId: string
  onClose: () => void
  onConfirm: (result: CheckoutComplianceResult) => void
}

export function CheckoutComplianceModal({
  cart,
  products,
  storeId,
  onClose,
  onConfirm,
}: Props) {
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  )

  const lotProducts = useMemo(
    () =>
      cart
        .map((l) => productById.get(l.productId))
        .filter((p): p is ProductWithStock => !!p?.trackLots),
    [cart, productById],
  )

  const serialProducts = useMemo(
    () =>
      cart
        .map((l) => productById.get(l.productId))
        .filter((p): p is ProductWithStock => !!p?.trackSerialNumbers),
    [cart, productById],
  )

  const needsPrescription = useMemo(
    () =>
      cart.some((l) => productById.get(l.productId)?.requiresPrescription),
    [cart, productById],
  )

  const allLots =
    useLiveQuery(
      () =>
        lotProducts.length > 0
          ? db.productLots.where('storeId').equals(storeId).toArray()
          : [],
      [storeId, lotProducts.length],
      [],
    ) ?? []

  const allSerials =
    useLiveQuery(
      () =>
        serialProducts.length > 0
          ? db.productSerialUnits.where('storeId').equals(storeId).toArray()
          : [],
      [storeId, serialProducts.length],
      [],
    ) ?? []

  const [lotSelections, setLotSelections] = useState<
    Record<string, LotAllocation[]>
  >({})
  const [serialSelections, setSerialSelections] = useState<
    Record<string, string[]>
  >({})
  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [prescriberName, setPrescriberName] = useState('')
  const [prescriptionNumber, setPrescriptionNumber] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [mutuelleName, setMutuelleName] = useState('')
  const [mutuelleCoveragePct, setMutuelleCoveragePct] = useState('')
  const [mutuelleAmountTTC, setMutuelleAmountTTC] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const nextLots: Record<string, LotAllocation[]> = {}
    for (const line of cart) {
      const p = productById.get(line.productId)
      if (!p?.trackLots) continue
      const lots = allLots.filter((l) => l.productId === line.productId)
      const alloc = allocateLotsFEFO(lots, line.qty)
      if (Array.isArray(alloc)) {
        nextLots[line.productId] = alloc
      }
    }
    setLotSelections(nextLots)
  }, [cart, productById, allLots])

  useEffect(() => {
    const nextSerials: Record<string, string[]> = {}
    for (const line of cart) {
      const p = productById.get(line.productId)
      if (!p?.trackSerialNumbers) continue
      const available = allSerials
        .filter(
          (s) => s.productId === line.productId && s.status === 'in_stock',
        )
        .slice(0, line.qty)
      nextSerials[line.productId] = available.map((s) => s.id)
    }
    setSerialSelections(nextSerials)
  }, [cart, productById, allSerials])

  const toggleSerial = (productId: string, unitId: string, lineQty: number) => {
    setSerialSelections((prev) => {
      const cur = prev[productId] ?? []
      if (cur.includes(unitId)) {
        return { ...prev, [productId]: cur.filter((id) => id !== unitId) }
      }
      if (cur.length >= lineQty) return prev
      return { ...prev, [productId]: [...cur, unitId] }
    })
  }

  const handleConfirm = () => {
    setErr(null)
    if (needsPrescription && !patientName.trim()) {
      setErr('Indiquez le nom du patient pour les produits soumis à ordonnance.')
      return
    }

    for (const line of cart) {
      const p = productById.get(line.productId)
      if (p?.trackLots) {
        const allocs = lotSelections[line.productId] ?? []
        const sum = allocs.reduce((s, a) => s + a.qty, 0)
        if (sum !== line.qty) {
          setErr(
            `Répartition lot incomplète pour « ${line.name} » (${sum}/${line.qty}).`,
          )
          return
        }
        for (const a of allocs) {
          if (lotExpiryStatus(a.expiryDate) === 'expired') {
            setErr(`Lot ${a.lotNumber} périmé — sélection impossible.`)
            return
          }
        }
      }
      if (p?.trackSerialNumbers) {
        const ids = serialSelections[line.productId] ?? []
        if (ids.length !== line.qty) {
          setErr(
            `Sélectionnez ${line.qty} n° de série pour « ${line.name} » (${ids.length} choisi(s)).`,
          )
          return
        }
      }
    }

    const lineMeta: CheckoutLineMeta[] = cart.map((line) => {
      const p = productById.get(line.productId)
      const meta: CheckoutLineMeta = {
        productId: line.productId,
        variantId: line.variantId,
      }
      if (p?.trackLots) {
        meta.lotAllocations = lotSelections[line.productId]
      }
      if (p?.trackSerialNumbers) {
        const ids = serialSelections[line.productId] ?? []
        meta.serialUnitIds = ids
        const units = allSerials.filter((s) => ids.includes(s.id))
        meta.serialNumbers = units.map((s) => s.serialNumber)
        meta.imeiNumbers = units
          .map((s) => s.imei)
          .filter((v): v is string => !!v?.trim())
      }
      return meta
    })

    let prescription: PrescriptionDraft | undefined
    if (needsPrescription) {
      prescription = {
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim() || undefined,
        prescriberName: prescriberName.trim() || undefined,
        prescriptionNumber: prescriptionNumber.trim() || undefined,
        issuedAt: issuedAt.trim() || undefined,
        notes: notes.trim() || undefined,
        mutuelleName: mutuelleName.trim() || undefined,
      }
      const cov = Number.parseFloat(mutuelleCoveragePct.replace(',', '.'))
      if (Number.isFinite(cov) && cov >= 0 && cov <= 100) {
        prescription.mutuelleCoveragePct = cov
      }
      const amt = Number.parseInt(mutuelleAmountTTC.replace(/\s/g, ''), 10)
      if (Number.isFinite(amt) && amt >= 0) {
        prescription.mutuelleAmountTTC = amt
      }
    }

    onConfirm({ lineMeta, prescription })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Contrôles vente"
      subtitle="Ordonnance, lots (DLC) et numéros de série"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="accent" onClick={handleConfirm}>
            Valider et encaisser
          </Button>
        </>
      }
    >
      <div className="max-h-[min(70vh,560px)] space-y-5 overflow-y-auto pr-1">
        {needsPrescription ? (
          <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <h3 className="text-sm font-semibold text-violet-900">
              Ordonnance / mutuelle
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Patient" required>
                <Input
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Nom complet"
                />
              </Field>
              <Field label="Téléphone patient">
                <Input
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="+225…"
                />
              </Field>
              <Field label="Prescripteur">
                <Input
                  value={prescriberName}
                  onChange={(e) => setPrescriberName(e.target.value)}
                  placeholder="Dr. …"
                />
              </Field>
              <Field label="N° ordonnance">
                <Input
                  value={prescriptionNumber}
                  onChange={(e) => setPrescriptionNumber(e.target.value)}
                />
              </Field>
              <Field label="Date ordonnance">
                <Input
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                />
              </Field>
              <Field label="Mutuelle / assurance">
                <Input
                  value={mutuelleName}
                  onChange={(e) => setMutuelleName(e.target.value)}
                  placeholder="CNAM, Allianz…"
                />
              </Field>
              <Field label="Prise en charge (%)" hint="optionnel">
                <Input
                  inputMode="decimal"
                  value={mutuelleCoveragePct}
                  onChange={(e) => setMutuelleCoveragePct(e.target.value)}
                  placeholder="80"
                />
              </Field>
              <Field label="Montant mutuelle (FCFA)" hint="optionnel">
                <Input
                  inputMode="numeric"
                  value={mutuelleAmountTTC}
                  onChange={(e) => setMutuelleAmountTTC(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </section>
        ) : null}

        {lotProducts.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Lots & péremption</h3>
            {cart
              .filter((l) => productById.get(l.productId)?.trackLots)
              .map((line) => {
                const allocs = lotSelections[line.productId] ?? []
                return (
                  <div
                    key={line.productId}
                    className="rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium text-ink">
                      {line.name}{' '}
                      <span className="text-ink-muted">× {line.qty}</span>
                    </p>
                    {allocs.length === 0 ? (
                      <p className="mt-1 text-xs text-rose-600">
                        Aucun lot disponible — réapprovisionnez dans Inventaire →
                        Lots.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {allocs.map((a) => {
                          const st = lotExpiryStatus(a.expiryDate)
                          return (
                            <li
                              key={a.lotId}
                              className="flex flex-wrap items-center gap-2 text-xs"
                            >
                              <span className="font-mono-nums">
                                Lot {a.lotNumber}
                              </span>
                              <span className="text-ink-muted">
                                DLC {a.expiryDate}
                              </span>
                              <span>× {a.qty}</span>
                              <Badge
                                tone={
                                  st === 'expired'
                                    ? 'danger'
                                    : st === 'soon'
                                      ? 'warning'
                                      : 'neutral'
                                }
                              >
                                {st === 'expired'
                                  ? 'Périmé'
                                  : st === 'soon'
                                    ? 'Bientôt'
                                    : 'OK'}
                              </Badge>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
          </section>
        ) : null}

        {serialProducts.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">
              Numéros de série / IMEI
            </h3>
            {cart
              .filter((l) => productById.get(l.productId)?.trackSerialNumbers)
              .map((line) => {
                const available = allSerials.filter(
                  (s) =>
                    s.productId === line.productId && s.status === 'in_stock',
                )
                const selected = serialSelections[line.productId] ?? []
                return (
                  <div
                    key={line.productId}
                    className="rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium text-ink">
                      {line.name}{' '}
                      <span className="text-ink-muted">
                        — choisir {line.qty} unité(s)
                      </span>
                    </p>
                    {available.length === 0 ? (
                      <p className="mt-1 text-xs text-rose-600">
                        Aucune unité en stock — enregistrez des séries dans
                        Inventaire → Séries.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {available.map((unit) => {
                          const on = selected.includes(unit.id)
                          return (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() =>
                                toggleSerial(line.productId, unit.id, line.qty)
                              }
                              className={cn(
                                'rounded-lg border px-2 py-1 text-left text-[11px] transition',
                                on
                                  ? 'border-zinc-900 bg-zinc-900 text-white'
                                  : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300',
                              )}
                            >
                              <span className="block font-mono-nums font-semibold">
                                {unit.serialNumber}
                              </span>
                              {unit.imei ? (
                                <span className="block opacity-80">
                                  IMEI {unit.imei}
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
          </section>
        ) : null}

        {err ? (
          <p className="text-sm text-rose-600" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
