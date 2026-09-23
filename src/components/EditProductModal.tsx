import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Product, ProductCategory, SaleUnit } from '../db/types'
import { SALE_UNIT_OPTIONS } from '../db/types'
import { db } from '../db/db'
import { DEFAULT_VAT_RATE_PCT } from '../lib/money'
import { getAppSettings } from '../lib/appSettings'
import { featuresForDomain } from '../lib/businessDomain'
import { categorySelectOptionsForDomain } from '../lib/domainCatalog'
import {
  normalizeProductDescription,
  normalizeProductHighlights,
} from '../lib/productDescription'
import {
  ensureDefaultProductFormSections,
  listProductFormSections,
  mergeCustomFieldValues,
  sanitizeCustomFieldsForSave,
  validateCustomFields,
} from '../lib/productFormSections'
import { resolveProductImageFields, type ProductImageFields } from '../lib/uploads/blob'
import { ProductCustomFormSections } from './ProductCustomFormSections'
import { Button } from '../ui/Button'
import { FormAlert, FormChip, FormSection, FormSwitchRow } from '../ui/Form'
import { IconTrash } from '../ui/icons'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Switch } from '../ui/Switch'

const VAT_PRESETS = [0, 9, 18] as const
const MAX_IMAGE_BYTES = 500 * 1024

type Props = {
  product: Product
  canEditPrices?: boolean
  stockAtActiveStore: number
  activeStoreLabel: string
  onClose: () => void
  onSave: (product: Product, stockAtActiveStore: number) => Promise<void>
  /** Suppression définitive (double confirmation côté parent). */
  onDelete?: () => void
  variant?: 'overlay' | 'page'
}

export function EditProductModal({
  product,
  canEditPrices = true,
  stockAtActiveStore,
  activeStoreLabel,
  onClose,
  onSave,
  onDelete,
  variant = 'overlay',
}: Props) {
  const activeDomain = getAppSettings().businessDomain
  const domainFeatures = featuresForDomain(activeDomain)
  const showMetierBlock =
    domainFeatures.prescription || domainFeatures.lots || domainFeatures.serials
  const showHardwareBlock = domainFeatures.fractionalUnits
  const categoryRows =
    useLiveQuery(
      () => db.productCategories.orderBy('sortOrder').toArray(),
      [],
      [],
    ) ?? []
  const categoryOptions = useMemo(() => {
    const names = categorySelectOptionsForDomain(
      activeDomain,
      categoryRows.map((r) => r.name),
    )
    const cur = product.category?.trim()
    if (cur && !names.some((n) => n.toLowerCase() === cur.toLowerCase())) {
      return [cur, ...names]
    }
    return names
  }, [activeDomain, categoryRows, product.category])
  const optionsForSelect =
    categoryOptions.length > 0
      ? categoryOptions
      : product.category
        ? [product.category]
        : []

  const [name, setName] = useState(product.name)
  const [priceTTC, setPriceTTC] = useState(String(product.priceTTC))
  const [purchasePriceTTC, setPurchasePriceTTC] = useState(
    product.purchasePriceTTC != null ? String(product.purchasePriceTTC) : '',
  )
  const [barcode, setBarcode] = useState(product.barcode)
  const [category, setCategory] = useState<ProductCategory>(product.category)
  const [stock, setStock] = useState(String(stockAtActiveStore))
  const [lowTh, setLowTh] = useState(String(product.lowStockThreshold))
  const [vatRatePct, setVatRatePct] = useState(
    String(product.vatRatePct ?? DEFAULT_VAT_RATE_PCT),
  )
  const [imagePreview, setImagePreview] = useState<string | undefined>(
    product.imageDataUrl ?? product.imageUrl,
  )
  const [description, setDescription] = useState(product.description ?? '')
  const [highlightsText, setHighlightsText] = useState(
    (product.highlights ?? []).join('\n'),
  )
  const [requiresPrescription, setRequiresPrescription] = useState(
    !!product.requiresPrescription,
  )
  const [trackLots, setTrackLots] = useState(!!product.trackLots)
  const [trackSerialNumbers, setTrackSerialNumbers] = useState(
    !!product.trackSerialNumbers,
  )
  const [saleUnit, setSaleUnit] = useState<SaleUnit>(product.saleUnit ?? 'piece')
  const [allowFractionalQty, setAllowFractionalQty] = useState(
    !!product.allowFractionalQty,
  )
  const [packContentQty, setPackContentQty] = useState(
    product.packContentQty != null ? String(product.packContentQty) : '',
  )
  const [packContentLabel, setPackContentLabel] = useState(
    product.packContentLabel ?? '',
  )
  const [brand, setBrand] = useState(product.brand ?? '')
  const [supplierRef, setSupplierRef] = useState(product.supplierRef ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [customFields, setCustomFields] = useState<
    Record<string, string | number | boolean | null>
  >(() => mergeCustomFieldValues([], product.customFields))

  const formSections =
    useLiveQuery(
      async () => {
        await ensureDefaultProductFormSections(activeDomain)
        return listProductFormSections(activeDomain)
      },
      [activeDomain],
      [],
    ) ?? []

  useEffect(() => {
    setCustomFields(mergeCustomFieldValues(formSections, product.customFields))
  }, [formSections, product.customFields, product.id])

  useEffect(() => {
    setName(product.name)
    setPriceTTC(String(product.priceTTC))
    setPurchasePriceTTC(
      product.purchasePriceTTC != null ? String(product.purchasePriceTTC) : '',
    )
    setBarcode(product.barcode)
    setCategory(product.category)
    setStock(String(stockAtActiveStore))
    setLowTh(String(product.lowStockThreshold))
    setVatRatePct(String(product.vatRatePct ?? DEFAULT_VAT_RATE_PCT))
    setImagePreview(product.imageDataUrl ?? product.imageUrl)
    setDescription(product.description ?? '')
    setHighlightsText((product.highlights ?? []).join('\n'))
    setRequiresPrescription(!!product.requiresPrescription)
    setTrackLots(!!product.trackLots)
    setTrackSerialNumbers(!!product.trackSerialNumbers)
    setSaleUnit(product.saleUnit ?? 'piece')
    setAllowFractionalQty(!!product.allowFractionalQty)
    setPackContentQty(
      product.packContentQty != null ? String(product.packContentQty) : '',
    )
    setPackContentLabel(product.packContentLabel ?? '')
    setBrand(product.brand ?? '')
    setSupplierRef(product.supplierRef ?? '')
  }, [product, stockAtActiveStore])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const price = canEditPrices
      ? Number.parseInt(priceTTC.replace(/\s/g, ''), 10)
      : product.priceTTC
    const st = Number.parseFloat(stock.replace(/\s/g, '').replace(',', '.'))
    const th = Number.parseInt(lowTh, 10)
    if (!name.trim()) return setErr('Indiquez un nom de produit.')
    if (canEditPrices && (!Number.isFinite(price) || price < 0))
      return setErr('Prix TTC invalide.')
    let purchaseOpt: number | undefined
    if (canEditPrices) {
      const purRaw = purchasePriceTTC.replace(/\s/g, '').trim()
      if (purRaw !== '') {
        const p = Number.parseInt(purRaw, 10)
        if (!Number.isFinite(p) || p < 0)
          return setErr('Prix de revient invalide.')
        purchaseOpt = p
      }
    }
    if (!barcode.trim()) return setErr('Indiquez un code-barres.')
    if (trackLots && trackSerialNumbers) {
      return setErr('Choisissez lots OU séries, pas les deux.')
    }
    if (trackSerialNumbers && allowFractionalQty) {
      return setErr('Quantités décimales incompatibles avec le suivi série.')
    }
    let packQty: number | undefined
    const packRaw = packContentQty.replace(/\s/g, '').trim()
    if (packRaw !== '') {
      packQty = Number.parseFloat(packRaw.replace(',', '.'))
      if (!Number.isFinite(packQty) || packQty <= 0) {
        return setErr('Contenu du conditionnement invalide.')
      }
    }
    const stockManagedByTracking = trackLots || trackSerialNumbers
    if (!stockManagedByTracking) {
      if (!Number.isFinite(st) || st < 0) return setErr('Stock invalide.')
    }
    if (!Number.isFinite(th) || th < 0) return setErr('Seuil invalide.')
    const vat = Number.parseFloat(vatRatePct.replace(',', '.'))
    if (!Number.isFinite(vat) || vat < 0 || vat > 100)
      return setErr('TVA invalide (0–100).')
    const customErr = validateCustomFields(formSections, customFields)
    if (customErr) return setErr(customErr)
    const next: Product = {
      ...product,
      name: name.trim(),
      priceTTC: canEditPrices ? price : product.priceTTC,
      category,
      barcode: barcode.trim(),
      lowStockThreshold: th,
      vatRatePct: Math.round(vat * 100) / 100,
      archived: product.archived,
      businessDomain: product.businessDomain ?? activeDomain,
      requiresPrescription,
      trackLots,
      trackSerialNumbers,
      saleUnit,
      allowFractionalQty: allowFractionalQty && !trackSerialNumbers,
    }
    if (packQty !== undefined) next.packContentQty = packQty
    else delete next.packContentQty
    const packLabel = packContentLabel.trim()
    if (packLabel) next.packContentLabel = packLabel
    else delete next.packContentLabel
    const brandTrim = brand.trim()
    if (brandTrim) next.brand = brandTrim
    else delete next.brand
    const refTrim = supplierRef.trim()
    if (refTrim) next.supplierRef = refTrim
    else delete next.supplierRef
    const desc = normalizeProductDescription(description)
    const highlights = normalizeProductHighlights(highlightsText)
    if (desc) next.description = desc
    else delete next.description
    if (highlights) next.highlights = highlights
    else delete next.highlights
    const custom = sanitizeCustomFieldsForSave(formSections, customFields)
    if (custom) next.customFields = custom
    else delete next.customFields
    if (canEditPrices) {
      if (purchaseOpt !== undefined) {
        next.purchasePriceTTC = purchaseOpt
      } else {
        delete next.purchasePriceTTC
      }
    }
    setBusy(true)
    try {
      let imageFields: ProductImageFields = {}
      if (imagePreview) {
        if (imagePreview.startsWith('data:')) {
          imageFields = await resolveProductImageFields(product.id, imagePreview)
        } else if (imagePreview === product.imageUrl && product.imageUrl) {
          imageFields = { imageUrl: product.imageUrl }
        } else if (imagePreview === product.imageDataUrl && product.imageDataUrl) {
          imageFields = { imageDataUrl: product.imageDataUrl }
        } else {
          imageFields = { imageUrl: imagePreview }
        }
      }
      delete next.imageDataUrl
      delete next.imageUrl
      Object.assign(next, imageFields)
      await onSave(next, stockManagedByTracking ? stockAtActiveStore : st)
      onClose()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      variant={variant}
      size="xl"
      onClose={onClose}
      title="Modifier l’article"
      subtitle={`Stock affiché pour ${activeStoreLabel}`}
      footer={
        <>
          {onDelete ? (
            <Button
              variant="danger"
              iconLeft={<IconTrash />}
              className="mr-auto"
              onClick={onDelete}
            >
              Supprimer
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="accent"
            loading={busy}
            onClick={(e) =>
              handleSubmit(e as unknown as React.FormEvent)
            }
          >
            Mettre à jour
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="ui-form">
        <FormSection
          title="Identité"
          description="Nom, code et classification dans le catalogue."
        >
          <Field label="Nom" required className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Code-barres" required>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
          <Field label="Catégorie" required>
            <Select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ProductCategory)
              }
            >
              {optionsForSelect.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>
        <FormSection
          title="Tarifs"
          description="Prix TTC, coût de revient et TVA."
        >
          <Field label="Prix TTC (FCFA)">
            <Input
              inputMode="numeric"
              value={priceTTC}
              onChange={(e) => setPriceTTC(e.target.value)}
              readOnly={!canEditPrices}
              disabled={!canEditPrices}
              className="font-mono-nums"
            />
          </Field>
          <Field label="Prix de revient TTC" hint="optionnel">
            <Input
              inputMode="numeric"
              value={purchasePriceTTC}
              onChange={(e) => setPurchasePriceTTC(e.target.value)}
              readOnly={!canEditPrices}
              disabled={!canEditPrices}
              placeholder="—"
              className="font-mono-nums"
            />
          </Field>
          <Field label="TVA (%)" required className="sm:col-span-2">
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {VAT_PRESETS.map((v) => (
                  <FormChip
                    key={v}
                    active={String(v) === vatRatePct.trim()}
                    onClick={() => setVatRatePct(String(v))}
                  >
                    {v} %
                  </FormChip>
                ))}
              </div>
              <Input
                inputMode="decimal"
                value={vatRatePct}
                onChange={(e) => setVatRatePct(e.target.value)}
                className="font-mono-nums"
              />
            </div>
          </Field>
        </FormSection>
        <FormSection
          title="Boutique"
          description="Fiche visible en ligne — photo, texte et arguments."
          columns={1}
        >
          <Field
            label="Description boutique"
            hint="Visible sur la fiche produit en ligne (max 1000 car.)"
          >
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ex. Poulet braisé mariné 24h, grillé au charbon, servi avec attiéké et sauce oignon…"
            />
          </Field>
          <Field
            label="Points forts"
            hint="Un par ligne — affichés en puces sur la boutique (max 5)"
          >
            <Textarea
              value={highlightsText}
              onChange={(e) => setHighlightsText(e.target.value)}
              rows={3}
              placeholder={'Portion généreuse\nGrillé au charbon\nSauce maison'}
            />
          </Field>
          <Field label="Photo" hint="Max 500 Ko · Vercel Blob si configuré">
            <input
              type="file"
              accept="image/*"
              className="ui-file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (f.size > MAX_IMAGE_BYTES) {
                  setErr('Image trop volumineuse (max 500 Ko).')
                  e.target.value = ''
                  return
                }
                setErr(null)
                const r = new FileReader()
                r.onload = () => {
                  const url =
                    typeof r.result === 'string' ? r.result : undefined
                  setImagePreview(url)
                }
                r.readAsDataURL(f)
              }}
            />
            {imagePreview ? (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={imagePreview}
                  alt=""
                  className="h-16 w-16 rounded-2xl border border-[rgba(0,51,170,0.12)] object-cover"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setImagePreview(undefined)}
                >
                  Retirer
                </Button>
              </div>
            ) : null}
          </Field>
        </FormSection>
        {showMetierBlock ? (
          <FormSection
            title="Métier"
            description="Traçabilité, ordonnance et obligations du rayon."
            columns={1}
          >
            {domainFeatures.prescription ? (
              <FormSwitchRow label="Ordonnance obligatoire">
                <Switch
                  checked={requiresPrescription}
                  onChange={(e) => setRequiresPrescription(e.target.checked)}
                />
              </FormSwitchRow>
            ) : null}
            {domainFeatures.lots ? (
              <FormSwitchRow label="Suivi par lots (n° lot + DLC)">
                <Switch
                  checked={trackLots}
                  onChange={(e) => {
                    const v = e.target.checked
                    setTrackLots(v)
                    if (v) setTrackSerialNumbers(false)
                  }}
                />
              </FormSwitchRow>
            ) : null}
            {domainFeatures.serials ? (
              <FormSwitchRow label="Suivi n° série / IMEI">
                <Switch
                  checked={trackSerialNumbers}
                  onChange={(e) => {
                    const v = e.target.checked
                    setTrackSerialNumbers(v)
                    if (v) {
                      setTrackLots(false)
                      setAllowFractionalQty(false)
                    }
                  }}
                />
              </FormSwitchRow>
            ) : null}
          </FormSection>
        ) : null}
        {showHardwareBlock ? (
          <FormSection
            title="Conditionnement"
            description="Unités de vente, vrac et références fournisseur."
          >
            <Field label="Unité de vente">
              <Select
                value={saleUnit}
                onChange={(e) => setSaleUnit(e.target.value as SaleUnit)}
              >
                {SALE_UNIT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <FormSwitchRow label="Quantités décimales (m, kg, L…)">
              <Switch
                checked={allowFractionalQty}
                disabled={trackSerialNumbers}
                onChange={(e) => setAllowFractionalQty(e.target.checked)}
              />
            </FormSwitchRow>
            <Field label="Contenu conditionnement" hint="ex. 100">
              <Input
                inputMode="decimal"
                value={packContentQty}
                onChange={(e) => setPackContentQty(e.target.value)}
                placeholder="—"
                className="font-mono-nums"
              />
            </Field>
            <Field label="Libellé contenu" hint="ex. vis, clous">
              <Input
                value={packContentLabel}
                onChange={(e) => setPackContentLabel(e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Marque">
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Réf. fournisseur">
              <Input
                value={supplierRef}
                onChange={(e) => setSupplierRef(e.target.value)}
                placeholder="—"
                className="font-mono-nums"
              />
            </Field>
          </FormSection>
        ) : null}
        <ProductCustomFormSections
          sections={formSections}
          values={customFields}
          onChange={(key, value) =>
            setCustomFields((prev) => ({ ...prev, [key]: value }))
          }
        />
        <FormSection
          title="Stock"
          description="Quantité magasin et seuil d’alerte."
        >
          <Field
            label="Stock (ce magasin)"
            required={!trackLots && !trackSerialNumbers}
            hint={
              trackLots
                ? 'Géré dans Inventaire → Lots'
                : trackSerialNumbers
                  ? 'Géré dans Inventaire → Séries'
                  : undefined
            }
          >
            <Input
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="font-mono-nums"
              readOnly={trackLots || trackSerialNumbers}
              disabled={trackLots || trackSerialNumbers}
            />
          </Field>
          <Field label="Alerte stock" required>
            <Input
              inputMode="numeric"
              value={lowTh}
              onChange={(e) => setLowTh(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
        </FormSection>
        {err ? <FormAlert>{err}</FormAlert> : null}
      </form>
    </Modal>
  )
}
