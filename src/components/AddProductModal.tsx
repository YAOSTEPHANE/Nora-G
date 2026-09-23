import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Product, ProductCategory, SaleUnit } from '../db/types'
import { SALE_UNIT_OPTIONS } from '../db/types'
import { db } from '../db/db'
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
import { resolveProductImageFields } from '../lib/uploads/blob'
import { ProductCustomFormSections } from './ProductCustomFormSections'
import { Button } from '../ui/Button'
import { FormAlert, FormChip, FormSection, FormSwitchRow } from '../ui/Form'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'

const VAT_PRESETS = [0, 9, 18] as const
const MAX_IMAGE_BYTES = 500 * 1024

type Props = {
  activeStoreLabel: string
  onClose: () => void
  onSave: (product: Product, initialStock: number) => Promise<void>
  variant?: 'overlay' | 'page'
}

export function AddProductModal({
  activeStoreLabel,
  onClose,
  onSave,
  variant = 'overlay',
}: Props) {
  const toast = useToast()
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
  const categoryOptions = useMemo(
    () =>
      categorySelectOptionsForDomain(
        activeDomain,
        categoryRows.map((r) => r.name),
      ),
    [activeDomain, categoryRows],
  )
  const [name, setName] = useState('')
  const [priceTTC, setPriceTTC] = useState('')
  const [purchasePriceTTC, setPurchasePriceTTC] = useState('')
  const [barcode, setBarcode] = useState('')
  const [category, setCategory] = useState<ProductCategory>(
    () => categorySelectOptionsForDomain(activeDomain, [])[0] ?? 'Autre',
  )
  const [stock, setStock] = useState('0')
  const [lowTh, setLowTh] = useState('5')
  const [vatRatePct, setVatRatePct] = useState(() =>
    String(getAppSettings().defaultVatRatePct),
  )
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>()
  const [description, setDescription] = useState('')
  const [highlightsText, setHighlightsText] = useState('')
  const [requiresPrescription, setRequiresPrescription] = useState(false)
  const [trackLots, setTrackLots] = useState(false)
  const [trackSerialNumbers, setTrackSerialNumbers] = useState(false)
  const [saleUnit, setSaleUnit] = useState<SaleUnit>('piece')
  const [allowFractionalQty, setAllowFractionalQty] = useState(false)
  const [packContentQty, setPackContentQty] = useState('')
  const [packContentLabel, setPackContentLabel] = useState('')
  const [brand, setBrand] = useState('')
  const [supplierRef, setSupplierRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [customFields, setCustomFields] = useState<
    Record<string, string | number | boolean | null>
  >({})

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
    setCustomFields(mergeCustomFieldValues(formSections, null))
  }, [formSections])

  useEffect(() => {
    if (categoryOptions.length === 0) return
    if (
      !categoryOptions.some((n) => n.toLowerCase() === category.toLowerCase())
    ) {
      setCategory(
        categoryOptions.includes('Autre')
          ? 'Autre'
          : (categoryOptions.find((n) => n.toLowerCase().includes('autre')) ??
              categoryOptions[0] ??
              'Autre'),
      )
    }
  }, [categoryOptions, category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const price = Number.parseInt(priceTTC.replace(/\s/g, ''), 10)
    const st = Number.parseFloat(stock.replace(/\s/g, '').replace(',', '.'))
    const th = Number.parseInt(lowTh.replace(/\s/g, ''), 10)
    if (!name.trim()) return setErr('Indiquez un nom de produit.')
    if (!Number.isFinite(price) || price < 0) return setErr('Prix TTC invalide.')
    let purchase: number | undefined
    const purRaw = purchasePriceTTC.replace(/\s/g, '').trim()
    if (purRaw !== '') {
      purchase = Number.parseInt(purRaw, 10)
      if (!Number.isFinite(purchase) || purchase < 0)
        return setErr('Prix de revient invalide.')
    }
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
    } else {
      if (st !== 0) {
        /* stock initial ignoré — réception via lots/séries */
      }
    }
    if (!Number.isFinite(th) || th < 0) return setErr('Seuil invalide.')
    const vat = Number.parseFloat(vatRatePct.replace(',', '.'))
    if (!Number.isFinite(vat) || vat < 0 || vat > 100)
      return setErr('TVA invalide (0–100).')
    const customErr = validateCustomFields(formSections, customFields)
    if (customErr) return setErr(customErr)
    const productId = crypto.randomUUID()
    setBusy(true)
    try {
      const imageFields = await resolveProductImageFields(productId, imageDataUrl)
      const desc = normalizeProductDescription(description)
      const highlights = normalizeProductHighlights(highlightsText)
      const custom = sanitizeCustomFieldsForSave(formSections, customFields)
      const product: Product = {
        id: productId,
        name: name.trim(),
        priceTTC: price,
        category,
        barcode: barcode.trim(),
        lowStockThreshold: th,
        vatRatePct: Math.round(vat * 100) / 100,
        archived: false,
        businessDomain: activeDomain,
        requiresPrescription,
        trackLots,
        trackSerialNumbers,
        saleUnit,
        allowFractionalQty: allowFractionalQty && !trackSerialNumbers,
        ...(packQty !== undefined ? { packContentQty: packQty } : {}),
        ...(packContentLabel.trim()
          ? { packContentLabel: packContentLabel.trim() }
          : {}),
        ...(brand.trim() ? { brand: brand.trim() } : {}),
        ...(supplierRef.trim() ? { supplierRef: supplierRef.trim() } : {}),
        ...(purchase !== undefined ? { purchasePriceTTC: purchase } : {}),
        ...(desc ? { description: desc } : {}),
        ...(highlights ? { highlights } : {}),
        ...(custom ? { customFields: custom } : {}),
        ...imageFields,
      }
      await onSave(product, stockManagedByTracking ? 0 : st)
      toast.success('Article créé', product.name)
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
      title="Nouveau produit"
      subtitle={`Stock initial sur ${activeStoreLabel}`}
      footer={
        <>
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
            Enregistrer
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
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Bissap maison"
            />
          </Field>
          <Field label="Code-barres" hint="Optionnel — laissez vide si aucun">
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scanner ou saisir (facultatif)"
              className="font-mono-nums"
              data-barcode-input
            />
          </Field>
          <Field label="Catégorie" required>
            <Select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as ProductCategory)
              }
            >
              {categoryOptions.map((c) => (
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
          <Field label="Prix TTC (FCFA)" required>
            <Input
              inputMode="numeric"
              value={priceTTC}
              onChange={(e) => setPriceTTC(e.target.value)}
              className="font-mono-nums"
            />
          </Field>
          <Field label="Prix de revient TTC" hint="optionnel">
            <Input
              inputMode="numeric"
              value={purchasePriceTTC}
              onChange={(e) => setPurchasePriceTTC(e.target.value)}
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
            hint="Visible sur la fiche produit en ligne (optionnel)"
          >
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ex. Ingrédients, portion, allergènes, conseil de dégustation…"
            />
          </Field>
          <Field
            label="Points forts"
            hint="Un par ligne — puces sur la boutique (max 5)"
          >
            <Textarea
              value={highlightsText}
              onChange={(e) => setHighlightsText(e.target.value)}
              rows={3}
              placeholder={'Fait maison\nServi frais\nSans colorant'}
            />
          </Field>
          <Field
            label="Photo"
            hint="Optionnel · max 500 Ko · stockée sur Vercel Blob si configuré"
          >
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
                  setImageDataUrl(url)
                }
                r.readAsDataURL(f)
              }}
            />
            {imageDataUrl ? (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={imageDataUrl}
                  alt=""
                  className="h-16 w-16 rounded-2xl border border-[rgba(0,51,170,0.12)] object-cover"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setImageDataUrl(undefined)}
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
          description="Quantité initiale et seuil d’alerte magasin."
        >
          <Field
            label="Stock initial"
            required={!trackLots && !trackSerialNumbers}
            hint={
              trackLots
                ? 'Réception via Inventaire → Lots'
                : trackSerialNumbers
                  ? 'Réception via Inventaire → Séries'
                  : undefined
            }
          >
            <Input
              inputMode="numeric"
              value={trackLots || trackSerialNumbers ? '0' : stock}
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
