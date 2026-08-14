import { useMemo, useState, type Ref } from 'react'
import type { CartLine, MobileMoneyOperator, SaleUnit } from '../db/types'
import type { CheckoutPaymentState } from '../lib/checkoutPayment'
import { validateCheckoutPayment } from '../lib/checkoutPayment'
import {
  formatFCFA,
  totalsFromLinesTTC,
  vatSlicesFromLinesTTC,
} from '../lib/money'
import {
  formatQty,
  packHint,
  saleUnitOf,
  saleUnitShort,
} from '../lib/saleUnit'
import { MOBILE_OPERATOR_LABELS } from '../lib/paymentDisplay'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Input'
import { Switch } from '../ui/Switch'
import { cn } from '../ui/cn'
import { ProductImage } from './ProductImage'
import {
  IconCard,
  IconCash,
  IconChevronRight,
  IconChevronDown,
  IconClose,
  IconMinus,
  IconMobile,
  IconPlus,
  IconReceipt,
  IconSparkles,
  IconTable,
  IconTag,
  IconTrash,
  IconUser,
} from '../ui/icons'

type Props = {
  lines: CartLine[]
  products: {
    id: string
    stock: number
    name: string
    category?: string
    imageUrl?: string
    imageDataUrl?: string
    saleUnit?: SaleUnit
    allowFractionalQty?: boolean
    packContentQty?: number
    packContentLabel?: string
    brand?: string
  }[]
  discountPct: number
  /** Plafond remise (affichage aide, aligné sur les permissions). */
  maxDiscountPct: number
  promoInput: string
  onPromoInputChange: (v: string) => void
  onApplyPromo: () => void
  promoFeedback: string | null
  payment: CheckoutPaymentState
  onPaymentPatch: (patch: Partial<CheckoutPaymentState>) => void
  online: boolean
  canPayElectronic?: boolean
  receiptPrinterEnabled?: boolean
  onInc: (productId: string) => void
  onDec: (productId: string) => void
  /** Saisie directe de quantité (quincaillerie / vrac). */
  onSetQty?: (productId: string, qty: number) => void
  onRemove: (productId: string) => void
  onClear: () => void
  /** Annulation transaction en cours (audit). */
  onCancelTransaction?: () => void
  onCheckout: () => void
  checkoutBusy: boolean
  /** Si fourni, ajoute un bouton de fermeture (drawer mobile). */
  onClose?: () => void
  /** Cible pour animation « ajout au panier » (compteur dans l’en-tête). */
  countBadgeRef?: Ref<HTMLSpanElement | null>
  tableOptions?: { id: string; name: string; status?: string; statusCode?: string }[]
  selectedTableId?: string
  onSelectedTableIdChange?: (tableId: string) => void
  loyaltyPhone?: string
  onLoyaltyPhoneChange?: (value: string) => void
  loyaltyPointsAvailable?: number
  loyaltyRedeemPoints?: string
  onLoyaltyRedeemPointsChange?: (value: string) => void
  loyaltyRedeemAmountTTC?: number
  payableTotalTTC?: number
  /** Encours crédit disponible (plafond − solde). */
  creditAvailableTTC?: number
  dayClosed?: boolean
  dayClosedLabel?: string
}

function stockFor(
  products: Props['products'],
  productId: string,
): number {
  return products.find((p) => p.id === productId)?.stock ?? 0
}

function quickCashSuggestions(amountDue: number): number[] {
  if (!Number.isFinite(amountDue) || amountDue <= 0) return []
  const fixedDenominations = [1000, 2000, 5000, 10000, 15000, 20000]
  const nearestHigherFixed =
    fixedDenominations.find((v) => v >= amountDue) ?? Math.ceil(amountDue / 5000) * 5000
  const candidates = [amountDue, nearestHigherFixed, ...fixedDenominations]
  return [...new Set(candidates)]
    .filter((v) => v >= amountDue)
    .sort((a, b) => a - b)
    .slice(0, 6)
}

const PAYMENT_METHODS = [
  { id: 'cash' as const, label: 'Espèces', Icon: IconCash },
  { id: 'card' as const, label: 'Carte', Icon: IconCard },
  { id: 'mobile' as const, label: 'Mobile', Icon: IconMobile },
  { id: 'credit' as const, label: 'Crédit', Icon: IconUser },
]

export function CartPanel({
  lines,
  products,
  discountPct,
  promoInput,
  onPromoInputChange,
  onApplyPromo,
  promoFeedback,
  payment,
  onPaymentPatch,
  online,
  canPayElectronic = online,
  onInc,
  onDec,
  onSetQty,
  onRemove,
  onClear,
  onCancelTransaction,
  onCheckout,
  checkoutBusy,
  onClose,
  countBadgeRef,
  tableOptions = [],
  selectedTableId = '',
  onSelectedTableIdChange,
  loyaltyPhone = '',
  onLoyaltyPhoneChange,
  loyaltyPointsAvailable = 0,
  loyaltyRedeemPoints = '',
  onLoyaltyRedeemPointsChange,
  loyaltyRedeemAmountTTC = 0,
  payableTotalTTC,
  creditAvailableTTC = 0,
  dayClosed = false,
  dayClosedLabel,
}: Props) {
  const totals = totalsFromLinesTTC(lines, discountPct)
  const vatSlices = vatSlicesFromLinesTTC(lines, discountPct)
  const count = lines.reduce((s, l) => s + l.qty, 0)
  const totalRounded = Math.round(payableTotalTTC ?? totals.totalTTC)
  const validation = validateCheckoutPayment(payment, totalRounded, canPayElectronic)
  const selectedTable = tableOptions.find((table) => table.id === selectedTableId)
  const selectedTableIsUnavailable =
    selectedTable?.statusCode === 'occupied' || selectedTable?.statusCode === 'reserved'
  const checkoutDisabled =
    lines.length === 0 ||
    checkoutBusy ||
    !validation.ok ||
    selectedTableIsUnavailable ||
    dayClosed

  const showMobileOperators =
    (!payment.mixed && payment.method === 'mobile') || payment.mixed

  const changePreview =
    validation.ok && validation.changeDue != null
      ? validation.changeDue
      : null

  const mobileSplit =
    Number.parseInt(payment.splitMobile.replace(/\s/g, '') || '0', 10)
  const cardSplit =
    Number.parseInt(payment.splitCard.replace(/\s/g, '') || '0', 10)
  const cashSplit =
    Number.parseInt(payment.splitCash.replace(/\s/g, '') || '0', 10)
  const cashDue = payment.mixed ? Math.max(0, cashSplit) : totalRounded
  const quickAmounts = quickCashSuggestions(cashDue)

  const hasTableFeature = tableOptions.length > 0 && !!onSelectedTableIdChange
  const hasLoyaltyFeature = !!onLoyaltyPhoneChange
  const hasCollapsibleExtras = hasTableFeature || hasLoyaltyFeature
  const extrasActive =
    Boolean(selectedTableId) ||
    loyaltyPhone.trim().length > 0 ||
    loyaltyRedeemPoints.trim().length > 0
  const [showExtras, setShowExtras] = useState(extrasActive)
  const [showTaxDetail, setShowTaxDetail] = useState(false)
  const promoActive =
    promoInput.trim().length > 0 || discountPct > 0 || Boolean(promoFeedback)

  const displayTotal = payableTotalTTC ?? totals.totalTTC
  const hasLoyaltyDiscount = displayTotal < totals.totalTTC
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  )

  const activePaymentLabel = payment.mixed
    ? 'Paiement mixte'
    : PAYMENT_METHODS.find((m) => m.id === payment.method)?.label ?? 'Paiement'

  return (
    <aside className="caisse-cart flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col lg:w-[400px] xl:w-[428px]">
      <div className="caisse-cart-header flex shrink-0 items-start justify-between gap-3 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer le panier"
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-caisse-gold transition hover:bg-caisse-gold-soft hover:text-[#00257a]"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(0,51,170,0.2)] bg-caisse-gold-soft text-caisse-gold">
              <IconReceipt className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-caisse-ink">
                Ticket
              </h2>
              <span
                ref={countBadgeRef}
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[rgba(0,51,170,0.25)] bg-white px-1.5 text-[10px] font-bold text-caisse-gold"
              >
                {count}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-caisse-muted">
              {count === 0
                ? 'Aucun article'
                : `${count} article${count > 1 ? 's' : ''} · ${lines.length} ligne${lines.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onCancelTransaction ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelTransaction}
              disabled={lines.length === 0 || checkoutBusy}
              className="h-8 px-2.5 text-[11px]"
            >
              Annuler
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            disabled={lines.length === 0}
            aria-label="Vider le panier"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <IconTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className={cn(
          'caisse-cart-body caisse-cart-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3.5',
          lines.length === 0 && 'flex flex-col',
        )}
      >
        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-[1.35rem] border border-[rgba(0,51,170,0.18)] bg-[linear-gradient(145deg,#ffffff,#e8eefa)] text-caisse-gold shadow-[0_12px_28px_-18px_rgba(0,51,170,0.45)]">
              <IconReceipt className="h-7 w-7" />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-caisse-ink">Panier vide</p>
              <p className="mx-auto mt-1 max-w-[230px] text-[12.5px] leading-relaxed text-caisse-muted">
                Scannez un code-barres ou touchez un article du catalogue.
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lines.map((line) => {
              const max = stockFor(products, line.productId)
              const product = productById.get(line.productId)
              const unit = saleUnitOf(product)
              const atStockLimit = max > 0 && line.qty >= max - 1e-9
              const lineTotal = line.unitPriceTTC * line.qty
              const pack = product ? packHint(product) : null
              return (
                <li key={line.productId} className="caisse-cart-line px-1.5 py-1.5">
                  <div className="flex items-center gap-2">
                    {product ? (
                      <ProductImage
                        product={product}
                        className="h-8 w-8 shrink-0 rounded-lg border border-[rgba(0,51,170,0.14)] object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(0,51,170,0.14)] bg-caisse-gold-soft text-[9px] font-bold text-caisse-gold"
                        aria-hidden
                      >
                        {line.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="min-w-0 truncate text-[12px] font-semibold leading-tight text-caisse-ink">
                        {line.name}
                      </p>
                      <p className="font-mono-nums text-[10px] text-caisse-muted">
                        {formatFCFA(line.unitPriceTTC)}
                        {unit !== 'piece' ? (
                          <span> / {saleUnitShort(unit)}</span>
                        ) : null}
                        {product?.brand ? (
                          <span className="ml-1">· {product.brand}</span>
                        ) : null}
                        {pack ? (
                          <span className="ml-1 text-caisse-muted">· {pack}</span>
                        ) : null}
                        {atStockLimit ? (
                          <span className="ml-1 font-medium text-amber-700">
                            · max {formatQty(max, unit)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="caisse-qty-control inline-flex shrink-0 items-center p-px">
                      <button
                        type="button"
                        onClick={() => onDec(line.productId)}
                        className="caisse-qty-btn flex h-6 w-6 items-center justify-center rounded-md text-caisse-ink transition hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                        aria-label="Diminuer"
                      >
                        <IconMinus className="h-3 w-3" />
                      </button>
                      {onSetQty && product?.allowFractionalQty ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Quantité ${line.name}`}
                          className="h-6 w-12 border-0 bg-transparent text-center font-mono-nums text-[12px] font-bold text-caisse-ink outline-none"
                          value={String(line.qty)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(',', '.')
                            if (raw === '' || raw === '.') return
                            const n = Number.parseFloat(raw)
                            if (!Number.isFinite(n)) return
                            onSetQty(line.productId, n)
                          }}
                        />
                      ) : (
                        <span className="min-w-5 text-center font-mono-nums text-[12px] font-bold text-caisse-ink">
                          {formatQty(line.qty, unit)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onInc(line.productId)}
                        disabled={atStockLimit}
                        className="caisse-qty-btn flex h-6 w-6 items-center justify-center rounded-md text-caisse-gold transition hover:bg-caisse-gold-soft active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Augmenter"
                      >
                        <IconPlus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="caisse-price w-[4.75rem] shrink-0 text-right font-mono-nums text-[12px]">
                      {formatFCFA(lineTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(line.productId)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Retirer ${line.name}`}
                    >
                      <IconClose className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {lines.length > 0 ? (
          <div className="caisse-cart-recap mt-4 space-y-3">
            {hasCollapsibleExtras ? (
              <button
                type="button"
                onClick={() => setShowExtras((open) => !open)}
                className="caisse-cart-section-toggle flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                aria-expanded={showExtras}
              >
                <span className="flex items-center gap-2 text-[12.5px] font-semibold text-caisse-ink">
                  <IconTable className="h-3.5 w-3.5 text-caisse-gold" />
                  Table & fidélité
                </span>
                <span className="flex items-center gap-1.5">
                  {extrasActive && !showExtras ? (
                    <span className="rounded-full bg-caisse-gold-soft px-2 py-0.5 text-[10px] font-medium text-caisse-gold">
                      Actif
                    </span>
                  ) : null}
                  <IconChevronDown
                    className={cn(
                      'h-4 w-4 text-caisse-gold/70 transition-transform',
                      showExtras && 'rotate-180',
                    )}
                  />
                </span>
              </button>
            ) : null}

            {(showExtras || !hasCollapsibleExtras) && (
              <>
                {hasTableFeature ? (
                  <div className="caisse-cart-section">
                    <Field label="Affecter à une table">
                      <Select
                        value={selectedTableId}
                        onChange={(e) => onSelectedTableIdChange(e.target.value)}
                      >
                        <option value="">Aucune table</option>
                        {tableOptions.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.name}
                            {table.status ? ` (${table.status})` : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {selectedTableIsUnavailable ? (
                      <p className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
                        Encaissement bloqué : la table sélectionnée est occupée ou réservée.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {hasLoyaltyFeature ? (
                  <div className="caisse-cart-section grid gap-2">
                    <Field label="Client fidélité (téléphone)">
                      <Input
                        value={loyaltyPhone}
                        onChange={(e) => onLoyaltyPhoneChange(e.target.value)}
                        placeholder="07 00 00 00 00"
                        iconLeft={<IconUser />}
                      />
                    </Field>
                    <Field label={`Points à utiliser (solde: ${loyaltyPointsAvailable})`}>
                      <Input
                        inputMode="numeric"
                        value={loyaltyRedeemPoints}
                        onChange={(e) => onLoyaltyRedeemPointsChange?.(e.target.value)}
                        placeholder="0"
                        iconLeft={<IconSparkles />}
                      />
                    </Field>
                    {loyaltyRedeemAmountTTC > 0 ? (
                      <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                        Réduction fidélité : {formatFCFA(loyaltyRedeemAmountTTC)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            <div className="caisse-cart-section">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-caisse-muted">
                  <IconTag className="h-3 w-3 text-caisse-gold" />
                  Code promo
                </p>
                {promoActive ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {discountPct > 0 ? `−${discountPct} %` : 'Saisi'}
                  </span>
                ) : null}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={promoInput}
                  onChange={(e) => onPromoInputChange(e.target.value)}
                  placeholder="Ex. BIENVENUE10"
                  className="min-w-0 flex-1 text-[12px]"
                />
                <Button size="md" variant="secondary" onClick={onApplyPromo} className="shrink-0">
                  OK
                </Button>
              </div>
              {promoFeedback ? (
                <p className="mt-1.5 text-[11px] text-zinc-600">{promoFeedback}</p>
              ) : null}
              {discountPct > 0 ? (
                <p className="mt-1 text-[11px] font-medium text-emerald-700">
                  Remise panier : {discountPct} %
                </p>
              ) : null}
            </div>

            <div className="caisse-cart-summary">
              <button
                type="button"
                onClick={() => setShowTaxDetail((open) => !open)}
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={showTaxDetail}
              >
                <span className="text-[12.5px] font-semibold text-caisse-ink">
                  Récapitulatif
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="caisse-price font-mono-nums text-[14px]">
                    {formatFCFA(totals.totalTTC)}
                  </span>
                  <IconChevronDown
                    className={cn(
                      'h-4 w-4 text-caisse-gold/70 transition-transform',
                      showTaxDetail && 'rotate-180',
                    )}
                  />
                </span>
              </button>

              {showTaxDetail ? (
                <div className="mt-2.5 space-y-1.5 border-t border-[rgba(0,51,170,0.1)] pt-2.5 text-[12px] text-caisse-muted">
                  <div className="flex justify-between">
                    <span>Sous-total HT</span>
                    <span className="font-mono-nums text-caisse-ink">
                      {formatFCFA(totals.subtotalHT)}
                    </span>
                  </div>
                  {vatSlices.map((s) => (
                    <div key={s.ratePct} className="flex justify-between">
                      <span>TVA {s.ratePct} %</span>
                      <span className="font-mono-nums text-caisse-ink">{formatFCFA(s.tva)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-2.5 flex items-baseline justify-between border-t border-[rgba(0,51,170,0.12)] pt-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-caisse-muted">
                  Total TTC
                </span>
                <span className="caisse-total-display font-mono-nums text-[17px]">
                  {formatFCFA(totals.totalTTC)}
                </span>
              </div>

              {loyaltyRedeemAmountTTC > 0 ? (
                <div className="mt-1.5 flex justify-between text-[12px] text-emerald-700">
                  <span>Fidélité</span>
                  <span className="font-mono-nums">− {formatFCFA(loyaltyRedeemAmountTTC)}</span>
                </div>
              ) : null}

              {hasLoyaltyDiscount ? (
                <div className="mt-2 flex items-baseline justify-between rounded-xl bg-emerald-50 px-3 py-2">
                  <span className="text-[12px] font-semibold text-emerald-800">À payer</span>
                  <span className="font-mono-nums text-[16px] font-bold text-emerald-800">
                    {formatFCFA(displayTotal)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="caisse-cart-payment">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="ui-eyebrow">Paiement</p>
                <Switch
                  label="Mixte"
                  checked={payment.mixed}
                  onChange={(e) => {
                    const mixed = e.target.checked
                    if (mixed) {
                      onPaymentPatch({
                        mixed: true,
                        splitCash: String(totalRounded),
                        splitCard: '0',
                        splitMobile: '0',
                      })
                    } else {
                      onPaymentPatch({ mixed: false })
                    }
                  }}
                />
              </div>

              {!canPayElectronic && !payment.mixed ? (
                <p className="mb-2.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                  Hors ligne : espèces ou crédit client.
                </p>
              ) : null}

              {!payment.mixed ? (
                <div
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                  role="group"
                  aria-label="Mode de paiement"
                >
                  {PAYMENT_METHODS.map(({ id, label, Icon }) => {
                    const disabled =
                      ((id === 'card' || id === 'mobile') && !canPayElectronic) ||
                      (id === 'credit' && creditAvailableTTC <= 0)
                    const active = payment.method === id
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (id === 'cash') {
                            onPaymentPatch({
                              method: 'cash',
                              cashReceived:
                                payment.cashReceived.trim() === ''
                                  ? String(totalRounded)
                                  : payment.cashReceived,
                            })
                          } else if (id === 'credit') {
                            if (creditAvailableTTC > 0) {
                              onPaymentPatch({ method: 'credit' })
                            }
                          } else if (canPayElectronic) {
                            onPaymentPatch({ method: id })
                          }
                        }}
                        className={cn(
                          'caisse-pay-tab flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-semibold transition',
                          active
                            ? 'caisse-pay-tab-active'
                            : 'border-[rgba(0,51,170,0.16)] bg-white text-caisse-muted hover:border-[rgba(0,51,170,0.35)] hover:text-caisse-ink',
                          disabled && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {!payment.mixed && payment.method === 'credit' ? (
                <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800">
                  Crédit client — disponible {formatFCFA(creditAvailableTTC)}. Le
                  solde encours sera augmenté du total.
                </p>
              ) : null}
              {payment.mixed ? (
                <div className="space-y-2 rounded-xl border border-[rgba(0,51,170,0.14)] bg-white p-2.5">
                  <p className="text-[11px] text-caisse-muted">
                    Répartition (somme = {formatFCFA(totalRounded)})
                  </p>
                  <Field label="Espèces (FCFA)">
                    <Input
                      inputMode="numeric"
                      value={payment.splitCash}
                      onChange={(e) =>
                        onPaymentPatch({ splitCash: e.target.value })
                      }
                      className="font-mono-nums"
                    />
                  </Field>
                  <Field label="Carte TPE (FCFA)">
                    <Input
                      inputMode="numeric"
                      value={payment.splitCard}
                      onChange={(e) =>
                        onPaymentPatch({ splitCard: e.target.value })
                      }
                      className="font-mono-nums"
                    />
                  </Field>
                  <Field label="Mobile money (FCFA)">
                    <Input
                      inputMode="numeric"
                      value={payment.splitMobile}
                      onChange={(e) =>
                        onPaymentPatch({ splitMobile: e.target.value })
                      }
                      className="font-mono-nums"
                    />
                  </Field>
                </div>
              ) : null}

              {showMobileOperators ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-medium text-caisse-muted">
                    Opérateur mobile
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['orange', MOBILE_OPERATOR_LABELS.orange],
                        ['mtn', MOBILE_OPERATOR_LABELS.mtn],
                        ['wave', MOBILE_OPERATOR_LABELS.wave],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          onPaymentPatch({
                            mobileOperator: id as MobileMoneyOperator,
                          })
                        }
                        className={cn(
                          'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition',
                          payment.mobileOperator === id
                            ? 'caisse-operator-active'
                            : 'border-[rgba(0,51,170,0.16)] bg-white text-caisse-muted hover:border-[rgba(0,51,170,0.35)]',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {!payment.mixed && payment.method === 'cash' ? (
                <div className="mt-3 space-y-1.5">
                  <Field label="Montant reçu (FCFA)">
                    <Input
                      inputMode="numeric"
                      value={payment.cashReceived}
                      onChange={(e) =>
                        onPaymentPatch({ cashReceived: e.target.value })
                      }
                      placeholder={String(totalRounded)}
                      className="font-mono-nums"
                    />
                  </Field>
                  {quickAmounts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {quickAmounts.map((value) => (
                        <button
                          key={`quick-cash-${value}`}
                          type="button"
                          onClick={() => onPaymentPatch({ cashReceived: String(value) })}
                          className={cn(
                            'rounded-lg border px-2.5 py-1.5 text-[11px] font-mono-nums font-semibold transition',
                            payment.cashReceived.replace(/\s/g, '') === String(value)
                              ? 'caisse-operator-active'
                              : 'border-[rgba(0,51,170,0.16)] bg-white text-caisse-muted hover:border-[rgba(0,51,170,0.35)]',
                          )}
                        >
                          {formatFCFA(value)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {changePreview !== null ? (
                    <p className="rounded-xl bg-emerald-50 px-2.5 py-2 text-[12px] font-semibold text-emerald-800">
                      Monnaie à rendre :{' '}
                      <span className="font-mono-nums">
                        {formatFCFA(changePreview)}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {payment.mixed && cashSplit > 0 ? (
                <div className="mt-3 space-y-1.5">
                  <Field label="Reçu en espèces (FCFA)">
                    <Input
                      inputMode="numeric"
                      value={payment.cashReceived}
                      onChange={(e) =>
                        onPaymentPatch({ cashReceived: e.target.value })
                      }
                      className="font-mono-nums"
                    />
                  </Field>
                  {quickAmounts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {quickAmounts.map((value) => (
                        <button
                          key={`quick-mixed-cash-${value}`}
                          type="button"
                          onClick={() => onPaymentPatch({ cashReceived: String(value) })}
                          className={cn(
                            'rounded-lg border px-2.5 py-1.5 text-[11px] font-mono-nums font-semibold transition',
                            payment.cashReceived.replace(/\s/g, '') === String(value)
                              ? 'caisse-operator-active'
                              : 'border-[rgba(0,51,170,0.16)] bg-white text-caisse-muted hover:border-[rgba(0,51,170,0.35)]',
                          )}
                        >
                          {formatFCFA(value)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {changePreview !== null ? (
                    <p className="rounded-xl bg-emerald-50 px-2.5 py-2 text-[12px] font-semibold text-emerald-800">
                      Monnaie à rendre :{' '}
                      <span className="font-mono-nums">
                        {formatFCFA(changePreview)}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {(!payment.mixed && payment.method === 'card') ||
              (payment.mixed && cardSplit > 0) ? (
                <Field label="Réf. TPE (optionnel)" className="mt-3">
                  <Input
                    value={payment.cardRef}
                    onChange={(e) => onPaymentPatch({ cardRef: e.target.value })}
                    placeholder="Auto si vide"
                    className="font-mono text-[11px]"
                  />
                </Field>
              ) : null}

              {(!payment.mixed && payment.method === 'mobile') ||
              (payment.mixed && mobileSplit > 0) ? (
                <Field label="Réf. transaction mobile (optionnel)" className="mt-3">
                  <Input
                    value={payment.mobileRef}
                    onChange={(e) => onPaymentPatch({ mobileRef: e.target.value })}
                    placeholder="Auto si vide"
                    className="font-mono text-[11px]"
                  />
                </Field>
              ) : null}

              {!validation.ok && lines.length > 0 ? (
                <p className="mt-2.5 text-[11px] text-rose-700">
                  {validation.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="caisse-cart-checkout shrink-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-caisse-muted">
              À encaisser
            </p>
            <p className="caisse-total-display mt-0.5 font-mono-nums text-[22px] leading-none">
              {formatFCFA(totalRounded)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full border border-[rgba(0,51,170,0.16)] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-caisse-gold">
              {activePaymentLabel}
            </span>
            {changePreview !== null && changePreview > 0 ? (
              <span className="caisse-cart-change rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                Monnaie {formatFCFA(changePreview)}
              </span>
            ) : null}
          </div>
        </div>

        <Button
          variant="accent"
          size="lg"
          fullWidth
          loading={checkoutBusy}
          onClick={onCheckout}
          disabled={checkoutDisabled}
          className="caisse-checkout-btn h-12 rounded-2xl text-[14px]"
        >
          {checkoutBusy ? 'Traitement…' : `Encaisser · ${formatFCFA(totalRounded)}`}
        </Button>
        {lines.length > 0 && checkoutDisabled && !checkoutBusy && !validation.ok && validation.message ? (
          <p className="mt-1.5 text-center text-[10px] text-rose-700">{validation.message}</p>
        ) : null}
        {dayClosed ? (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-center text-[10px] font-medium text-amber-800">
            {dayClosedLabel ??
              'Journée clôturée : encaissement bloqué. Réouvrez la journée depuis le journal.'}
          </p>
        ) : null}
      </div>
    </aside>
  )
}
