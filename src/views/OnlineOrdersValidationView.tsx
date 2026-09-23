import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { OnlineOrderMessageModal } from '../components/OnlineOrderMessageModal'
import { useSubscription } from '../context/SubscriptionContext'
import { db } from '../db/db'
import type {
  OnlineOrder,
  OnlineOrderMessage,
  OnlineOrderPlatform,
  Sale,
} from '../db/types'
import { downloadTextFile, toCsvSemicolon } from '../lib/analyticsExport'
import { formatFCFA } from '../lib/money'
import { sendOrderApprovedSms } from '../lib/onlineOrderSms'
import { deductKitchenIngredientStockForLines } from '../lib/kitchenStock'
import { flushSyncQueue } from '../lib/sync'
import { importStorefrontInbox } from '../lib/storefront/syncInbox'
import {
  omnichannelFulfillmentLabel,
  omnichannelPlatformLabel,
} from '../lib/omnichannel/channels'
import { createOmnichannelCatalogOrder } from '../lib/omnichannel/intake'
import {
  checkLinesAgainstSellableStock,
  deductOmnichannelOrderStock,
} from '../lib/omnichannel/stock'
import {
  getDeliveryProviderDemo,
  getKitchenStationDemo,
  isDeliveryModuleDemoOn,
  isKitchenModuleDemoOn,
} from '../lib/integrationsConfig'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Input, Select } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { SectionHeader } from '../ui/PageHeader'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'
import {
  IconCheck,
  IconClose,
  IconDownload,
  IconEdit,
  IconInfo,
  IconOnlineOrders,
  IconPrinter,
  IconSearch,
  IconTruck,
} from '../ui/icons'

type Props = {
  online: boolean
  activeStoreId: string
  activeStoreLabel: string
  canSwitchStore: boolean
  /** Gérant et admin uniquement : valider / rejeter une commande. */
  canValidateOnlineOrders: boolean
  reviewer: { id: string; displayName: string }
  onPrintOrder: (order: OnlineOrder, autoPrint?: boolean) => void
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function paymentLabel(method: OnlineOrder['paymentMethod']): string {
  switch (method) {
    case 'cash':
      return 'Espèces à la livraison'
    case 'card':
      return 'Carte bancaire'
    case 'mobile':
      return 'Mobile money'
    default:
      return 'Paiement mixte'
  }
}

function deliveryStatusLabel(status?: OnlineOrder['deliveryStatus']): string {
  switch (status) {
    case 'queued':
      return 'En file'
    case 'assigned':
      return 'Affectée'
    case 'picked_up':
      return 'Récupérée'
    case 'in_transit':
      return 'En transit'
    case 'delivered':
      return 'Livrée'
    case 'failed':
      return 'Échec'
    case 'cancelled':
      return 'Annulée'
    default:
      return 'N/A'
  }
}

function kitchenStatusLabel(status?: OnlineOrder['kitchenStatus']): string {
  switch (status) {
    case 'queued':
      return 'En file'
    case 'preparing':
      return 'En préparation'
    case 'ready':
      return 'Prête'
    case 'served':
      return 'Servie'
    case 'cancelled':
      return 'Annulée'
    default:
      return 'N/A'
  }
}

function platformLabel(platform?: OnlineOrderPlatform): string {
  return omnichannelPlatformLabel(platform)
}

export function OnlineOrdersValidationView({
  online,
  activeStoreId,
  activeStoreLabel,
  canSwitchStore,
  canValidateOnlineOrders,
  reviewer,
  onPrintOrder,
}: Props) {
  const toast = useToast()
  const { subscription } = useSubscription()
  const orders = useLiveQuery(
    () => db.onlineOrders.orderBy('createdAt').reverse().toArray(),
    [],
    [],
  )
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [allStores, setAllStores] = useState(false)
  const [reviewedLimit, setReviewedLimit] = useState(20)
  const [importPlatform, setImportPlatform] =
    useState<OnlineOrderPlatform>('whatsapp')
  const [importExternalRef, setImportExternalRef] = useState('')
  const [importCustomer, setImportCustomer] = useState('')
  const [importPhone, setImportPhone] = useState('')
  const [importAddress, setImportAddress] = useState('')
  const [importFulfillment, setImportFulfillment] = useState<
    'pickup' | 'delivery'
  >('pickup')
  const [importProductId, setImportProductId] = useState('')
  const [importQty, setImportQty] = useState('1')
  const [importLines, setImportLines] = useState<
    Array<{ productId: string; name: string; qty: number; unitPriceTTC: number }>
  >([])

  const { products: catalogProducts } = useDomainProducts()
  const activeCatalog = useMemo(
    () =>
      catalogProducts
        .filter((p) => !p.archived)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [catalogProducts],
  )
  const [messageOrderId, setMessageOrderId] = useState<string | null>(null)

  useEffect(() => {
    if (!online || !subscription?.licenseKey) return
    void importStorefrontInbox(subscription.licenseKey)
      .then((count) => {
        if (count > 0) {
          toast.success(
            count === 1
              ? '1 commande web reçue via votre lien boutique'
              : `${count} commandes web reçues via votre lien boutique`,
          )
        }
      })
      .catch(() => {
        /* inbox optionnel si API indisponible */
      })
  }, [online, subscription?.licenseKey, toast])

  const scopedOrders = useMemo(() => {
    const list = orders ?? []
    if (!canSwitchStore) {
      return list.filter((o) => o.storeId === activeStoreId)
    }
    if (allStores) return list
    return list.filter((o) => o.storeId === activeStoreId)
  }, [orders, canSwitchStore, allStores, activeStoreId])

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scopedOrders
    const qCompact = q.replace(/\s+/g, '')
    const qDigits = q.replace(/\D/g, '')
    return scopedOrders.filter((o) => {
      if (o.customerName.toLowerCase().includes(q)) return true
      if (o.id.slice(0, 8).toLowerCase().includes(qCompact)) return true
      if (qDigits.length >= 2) {
        const phone = (o.customerPhone ?? '').replace(/\D/g, '')
        if (phone.includes(qDigits)) return true
      }
      return false
    })
  }, [scopedOrders, search])

  const pending = useMemo(
    () => filteredOrders.filter((o) => o.status === 'pending'),
    [filteredOrders],
  )

  const reviewedSorted = useMemo(
    () =>
      [...filteredOrders.filter((o) => o.status !== 'pending')].sort(
        (a, b) =>
          (b.reviewedAt ?? b.createdAt) - (a.reviewedAt ?? a.createdAt),
      ),
    [filteredOrders],
  )

  const reviewedVisible = useMemo(
    () => reviewedSorted.slice(0, reviewedLimit),
    [reviewedSorted, reviewedLimit],
  )
  const deliveryOrders = useMemo(
    () =>
      reviewedSorted.filter(
        (o) => o.status === 'approved' && o.fulfillmentMode === 'delivery',
      ),
    [reviewedSorted],
  )
  const kitchenOrders = useMemo(
    () => reviewedSorted.filter((o) => o.status === 'approved'),
    [reviewedSorted],
  )
  const messageOrder = useMemo(
    () => scopedOrders.find((o) => o.id === messageOrderId) ?? null,
    [scopedOrders, messageOrderId],
  )
  const messageHistory =
    useLiveQuery(
      async () => {
        if (!messageOrderId) return [] as OnlineOrderMessage[]
        const rows = await db.onlineOrderMessages
          .where('orderId')
          .equals(messageOrderId)
          .toArray()
        return rows.sort((a, b) => b.createdAt - a.createdAt)
      },
      [messageOrderId],
      [],
    ) ?? []

  const hasMoreReviewed = reviewedSorted.length > reviewedLimit
  const platformBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const order of filteredOrders) {
      const key = platformLabel(order.sourcePlatform)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [filteredOrders])

  useEffect(() => {
    setReviewedLimit(20)
  }, [search, allStores, activeStoreId])

  const exportOrdersCsv = useCallback(() => {
    const rows: string[][] = [
      [
        'Réf',
        'Date création',
        'Magasin',
        'Client',
        'Téléphone',
        'Créneau',
        'Statut',
        'Plateforme',
        'Réf externe',
        'Total TTC',
        'Paiement',
        'Mode retrait',
        'Note client',
        'Message client',
        'Message interne',
        'Message MAJ le',
        'Message MAJ par',
        'Statut livraison',
        'Tracking',
        'Livreur',
        'Statut cuisine',
        'Station cuisine',
        'Validée / rejetée le',
        'Par',
      ],
      ...filteredOrders.map((o) => [
        o.id.slice(0, 8).toUpperCase(),
        new Date(o.createdAt).toLocaleString('fr-FR'),
        o.storeName ?? o.storeId,
        o.customerName,
        o.customerPhone ?? '',
        o.desiredTimeSlot ?? '',
        o.status === 'pending'
          ? 'En attente'
          : o.status === 'approved'
            ? 'Validée'
            : 'Rejetée',
        platformLabel(o.sourcePlatform),
        o.externalOrderRef ?? '',
        String(o.totalTTC),
        paymentLabel(o.paymentMethod),
        omnichannelFulfillmentLabel(o.fulfillmentMode),
        o.customerNote ?? '',
        o.customerMessage ?? '',
        o.internalMessage ?? '',
        o.messageUpdatedAt ? new Date(o.messageUpdatedAt).toLocaleString('fr-FR') : '',
        o.messageUpdatedByDisplayName ?? '',
        deliveryStatusLabel(o.deliveryStatus),
        o.deliveryTrackingCode ?? '',
        o.deliveryRiderName ?? '',
        kitchenStatusLabel(o.kitchenStatus),
        o.kitchenStation ?? '',
        o.reviewedAt
          ? new Date(o.reviewedAt).toLocaleString('fr-FR')
          : '',
        o.reviewedByDisplayName ?? '',
      ]),
    ]
    downloadTextFile(
      `commandes-ligne-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsvSemicolon(rows),
    )
    toast.success('Export prêt', `${filteredOrders.length} ligne(s)`)
  }, [filteredOrders, toast])

  const addImportLine = useCallback(() => {
    const product = activeCatalog.find((p) => p.id === importProductId)
    const qty = Number.parseInt(importQty.trim(), 10)
    if (!product) {
      toast.error('Produit requis', 'Choisissez un article du catalogue.')
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantité invalide', 'Indiquez une quantité positive.')
      return
    }
    setImportLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, qty: l.qty + qty } : l,
        )
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          qty,
          unitPriceTTC: product.priceTTC,
        },
      ]
    })
    setImportQty('1')
  }, [activeCatalog, importProductId, importQty, toast])

  const importRemoteOrder = useCallback(async () => {
    try {
      const order = await createOmnichannelCatalogOrder({
        storeId: activeStoreId,
        storeName: activeStoreLabel,
        platform: importPlatform,
        fulfillmentMode: importFulfillment,
        customerName: importCustomer,
        customerPhone: importPhone,
        customerAddress: importAddress,
        externalOrderRef: importExternalRef,
        lines: importLines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
        })),
      })
      setImportCustomer('')
      setImportPhone('')
      setImportAddress('')
      setImportExternalRef('')
      setImportLines([])
      toast.success(
        'Commande omnicanal créée',
        `${platformLabel(order.sourcePlatform)} · ${omnichannelFulfillmentLabel(order.fulfillmentMode)} · stock réservé`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Import impossible', msg)
    }
  }, [
    activeStoreId,
    activeStoreLabel,
    importAddress,
    importCustomer,
    importExternalRef,
    importFulfillment,
    importLines,
    importPhone,
    importPlatform,
    toast,
  ])

  const approveOrder = useCallback(
    async (order: OnlineOrder) => {
      if (busyOrderId) return
      setBusyOrderId(order.id)
      try {
        let approvedOrderId: string | null = null
        await db.transaction(
          'rw',
          [
            db.onlineOrders,
            db.products,
            db.storeStocks,
            db.sales,
            db.syncQueue,
            db.promotions,
            db.kitchenIngredients,
            db.kitchenIngredientStocks,
            db.productRecipeIngredients,
          ],
          async () => {
            const fresh = await db.onlineOrders.get(order.id)
            if (!fresh || fresh.status !== 'pending') return

            const recipeRows = await db.productRecipeIngredients.toArray()
            const deductionAt = Date.now()

            if (!fresh.stockDeductedAt) {
              const catalogLines = fresh.lines.filter(
                (l) => l.productId && l.productId !== 'remote-order',
              )
              if (catalogLines.length > 0) {
                const failures = await checkLinesAgainstSellableStock({
                  storeId: fresh.storeId,
                  lines: catalogLines,
                  ignoreOrderId: fresh.id,
                })
                if (failures.length > 0) {
                  const first = failures[0]!
                  throw new Error(
                    `Stock insuffisant pour « ${first.name} » (vendable : ${first.available}).`,
                  )
                }
                await deductOmnichannelOrderStock({
                  storeId: fresh.storeId,
                  lines: catalogLines,
                })
              }
            }

            if (!fresh.kitchenIngredientDeductedAt) {
              await deductKitchenIngredientStockForLines(
                fresh.storeId,
                fresh.lines,
                recipeRows,
              )
            }

            const saleId = crypto.randomUUID()
            const noteParts = [
              fresh.customerPhone,
              fresh.customerAddress,
              fresh.promoCode
                ? `Promo ${fresh.promoCode}${fresh.discountPct ? ` (${fresh.discountPct} %)` : ''}`
                : '',
            ].filter((v) => Boolean(v && String(v).length > 0))
            const note = noteParts.join(' · ')

            const saleRecord: Sale = {
              id: saleId,
              createdAt: fresh.createdAt,
              lines: fresh.lines,
              subtotalHT: fresh.subtotalHT,
              tva: fresh.tva,
              totalTTC: fresh.totalTTC,
              discountPct: fresh.discountPct ?? 0,
              paymentMethod: fresh.paymentMethod,
              synced: false,
              storeId: fresh.storeId,
              storeName: fresh.storeName,
              cashierProfileId: reviewer.id,
              cashierDisplayName: `${reviewer.displayName} · Validation web`,
              mobileMoneyReference: note || undefined,
            }

            await db.sales.add(saleRecord)
            if (fresh.promoCode) {
              const promo = await db.promotions
                .where('code')
                .equals(fresh.promoCode.toUpperCase())
                .first()
              if (promo) {
                await db.promotions.update(promo.id, {
                  usageCount: (promo.usageCount ?? 0) + 1,
                  updatedAt: Date.now(),
                })
              }
            }
            await db.syncQueue.add({
              kind: 'sale',
              payload: JSON.stringify({
                saleId,
                channel: 'web-validated',
                onlineOrderId: fresh.id,
              }),
              createdAt: Date.now(),
            })

            const approvedRecord: OnlineOrder = {
              ...fresh,
              status: 'approved',
              reviewedAt: Date.now(),
              reviewedByProfileId: reviewer.id,
              reviewedByDisplayName: reviewer.displayName,
              deliveryStatus:
                fresh.fulfillmentMode === 'delivery'
                  ? fresh.deliveryStatus ?? 'queued'
                  : undefined,
              deliveryProvider:
                fresh.fulfillmentMode === 'delivery' && isDeliveryModuleDemoOn()
                  ? fresh.deliveryProvider ?? getDeliveryProviderDemo()
                  : fresh.deliveryProvider,
              deliveryUpdatedAt:
                fresh.fulfillmentMode === 'delivery' ? Date.now() : undefined,
              kitchenStatus: isKitchenModuleDemoOn() ? 'queued' : undefined,
              kitchenPriority:
                isKitchenModuleDemoOn() && fresh.fulfillmentMode === 'delivery'
                  ? 'high'
                  : isKitchenModuleDemoOn()
                    ? 'normal'
                    : undefined,
              kitchenStation: isKitchenModuleDemoOn()
                ? getKitchenStationDemo()
                : undefined,
              kitchenTicketCode: isKitchenModuleDemoOn()
                ? `K-${fresh.id.slice(0, 6).toUpperCase()}`
                : undefined,
              kitchenUpdatedAt: isKitchenModuleDemoOn() ? Date.now() : undefined,
              stockDeductedAt: fresh.stockDeductedAt ?? deductionAt,
              kitchenIngredientDeductedAt:
                fresh.kitchenIngredientDeductedAt ?? deductionAt,
            }
            approvedOrderId = approvedRecord.id
            await db.onlineOrders.put(approvedRecord)
          },
        )

        if (online) {
          await flushSyncQueue()
        }
        toast.success('Commande validée avec succès', order.customerName)
        if (approvedOrderId) {
          const approvedSnapshot = await db.onlineOrders.get(approvedOrderId)
          if (!approvedSnapshot) return
          const sms = await sendOrderApprovedSms(approvedSnapshot)
          if (sms.ok) {
            await db.onlineOrders.update(approvedOrderId, {
              customerNotifiedAt: Date.now(),
              customerNotificationStatus: 'sent',
              customerNotificationError: undefined,
            })
            toast.info(
              'SMS client envoyé',
              sms.mode === 'webhook'
                ? 'Notification transmise au prestataire SMS.'
                : 'Mode démo: SMS journalisé localement.',
            )
          } else {
            await db.onlineOrders.update(approvedOrderId, {
              customerNotifiedAt: Date.now(),
              customerNotificationStatus: 'failed',
              customerNotificationError: sms.error,
            })
            toast.warning('SMS non envoyé', sms.error)
          }
        }
      } catch (e) {
        toast.error(
          'Validation impossible',
          e instanceof Error ? e.message : String(e),
        )
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, online, reviewer.displayName, reviewer.id, toast],
  )

  const rejectOrder = useCallback(
    async (order: OnlineOrder) => {
      if (busyOrderId) return
      const reason =
        window.prompt('Motif de rejet (optionnel) :', '') ?? ''
      setBusyOrderId(order.id)
      try {
        const fresh = await db.onlineOrders.get(order.id)
        if (!fresh || fresh.status !== 'pending') return
        await db.onlineOrders.put({
          ...fresh,
          status: 'rejected',
          reviewedAt: Date.now(),
          reviewedByProfileId: reviewer.id,
          reviewedByDisplayName: reviewer.displayName,
          reviewNote: reason.trim() || undefined,
        })
        toast.info('Commande rejetée', order.customerName)
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, reviewer.displayName, reviewer.id, toast],
  )

  const editOrder = useCallback(
    async (order: OnlineOrder) => {
      if (busyOrderId) return
      setBusyOrderId(order.id)
      try {
        const fresh = await db.onlineOrders.get(order.id)
        if (!fresh) return

        const customerNameRaw =
          window.prompt('Nom client', fresh.customerName) ?? fresh.customerName
        const customerName = customerNameRaw.trim()
        if (!customerName) {
          toast.error('Nom client requis')
          return
        }
        const customerPhoneRaw =
          window.prompt(
            'Téléphone (laisser vide pour supprimer)',
            fresh.customerPhone ?? '',
          ) ?? (fresh.customerPhone ?? '')
        const customerAddressRaw =
          window.prompt(
            'Adresse (laisser vide pour supprimer)',
            fresh.customerAddress ?? '',
          ) ?? (fresh.customerAddress ?? '')
        const desiredTimeSlotRaw =
          window.prompt(
            'Créneau souhaité (laisser vide pour supprimer)',
            fresh.desiredTimeSlot ?? '',
          ) ?? (fresh.desiredTimeSlot ?? '')
        const customerNoteRaw =
          window.prompt(
            'Note client (laisser vide pour supprimer)',
            fresh.customerNote ?? '',
          ) ?? (fresh.customerNote ?? '')

        await db.onlineOrders.put({
          ...fresh,
          customerName,
          customerPhone: customerPhoneRaw.trim() || undefined,
          customerAddress: customerAddressRaw.trim() || undefined,
          desiredTimeSlot: desiredTimeSlotRaw.trim() || undefined,
          customerNote: customerNoteRaw.trim() || undefined,
        })
        toast.success('Commande corrigée', customerName)
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, toast],
  )

  const editOrderLines = useCallback(
    async (order: OnlineOrder) => {
      if (busyOrderId) return
      setBusyOrderId(order.id)
      try {
        const fresh = await db.onlineOrders.get(order.id)
        if (!fresh) return
        const nextLines = [...fresh.lines]
        const lineChoices = nextLines
          .map((line, idx) => `${idx + 1}. ${line.name} (${line.qty} x ${formatFCFA(line.unitPriceTTC)})`)
          .join('\n')
        const rawIndex =
          window.prompt(
            `Choisissez la ligne à corriger (numéro) :\n${lineChoices}`,
            '1',
          ) ?? ''
        const index = Number.parseInt(rawIndex.trim(), 10) - 1
        if (!Number.isFinite(index) || index < 0 || index >= nextLines.length) {
          toast.error('Ligne invalide')
          return
        }
        const selected = nextLines[index]
        const qtyRaw =
          window.prompt(`Nouvelle quantité pour "${selected.name}"`, String(selected.qty)) ??
          String(selected.qty)
        const qty = Number.parseInt(qtyRaw.trim(), 10)
        if (!Number.isFinite(qty) || qty <= 0) {
          toast.error('Quantité invalide')
          return
        }
        const priceRaw =
          window.prompt(
            `Nouveau prix TTC (FCFA) pour "${selected.name}"`,
            String(selected.unitPriceTTC),
          ) ?? String(selected.unitPriceTTC)
        const unitPriceTTC = Number.parseInt(priceRaw.trim(), 10)
        if (!Number.isFinite(unitPriceTTC) || unitPriceTTC <= 0) {
          toast.error('Prix TTC invalide')
          return
        }
        nextLines[index] = {
          ...selected,
          qty,
          unitPriceTTC,
        }
        const subtotalHT = Math.round(
          nextLines.reduce(
            (sum, line) =>
              sum + (line.qty * line.unitPriceTTC * 100) / (100 + (line.vatRatePct ?? 18)),
            0,
          ),
        )
        const totalTTC = nextLines.reduce((sum, line) => sum + line.qty * line.unitPriceTTC, 0)
        const tva = totalTTC - subtotalHT
        await db.onlineOrders.put({
          ...fresh,
          lines: nextLines,
          subtotalHT,
          tva,
          totalTTC,
          netProductsTTC: totalTTC,
        })
        toast.success('Lignes corrigées', fresh.customerName)
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, toast],
  )

  const editOrderMessages = useCallback(
    async (order: OnlineOrder) => {
      if (busyOrderId) return
      setMessageOrderId(order.id)
    },
    [busyOrderId],
  )

  const saveOrderMessages = useCallback(
    async (order: OnlineOrder, payload: { customerMessage?: string; internalMessage?: string }) => {
      if (busyOrderId) return
      setBusyOrderId(order.id)
      try {
        const fresh = await db.onlineOrders.get(order.id)
        if (!fresh) return
        const hasMessage = !!(payload.customerMessage || payload.internalMessage)
        const previousCustomer = fresh.customerMessage ?? ''
        const previousInternal = fresh.internalMessage ?? ''
        const nextCustomer = payload.customerMessage ?? ''
        const nextInternal = payload.internalMessage ?? ''
        const changed =
          previousCustomer !== nextCustomer || previousInternal !== nextInternal
        await db.onlineOrders.put({
          ...fresh,
          customerMessage: payload.customerMessage,
          internalMessage: payload.internalMessage,
          messageUpdatedAt: hasMessage ? Date.now() : undefined,
          messageUpdatedByProfileId: hasMessage ? reviewer.id : undefined,
          messageUpdatedByDisplayName: hasMessage ? reviewer.displayName : undefined,
        })
        if (changed) {
          await db.onlineOrderMessages.add({
            id: crypto.randomUUID(),
            orderId: fresh.id,
            createdAt: Date.now(),
            authorProfileId: reviewer.id,
            authorDisplayName: reviewer.displayName,
            customerMessage: payload.customerMessage,
            internalMessage: payload.internalMessage,
          })
        }
        if (hasMessage) toast.success('Messages enregistrés', fresh.customerName)
        else toast.info('Messages supprimés', fresh.customerName)
        setMessageOrderId(null)
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, reviewer.displayName, reviewer.id, toast],
  )

  const updateDelivery = useCallback(
    async (order: OnlineOrder) => {
      if (busyOrderId) return
      const statusRaw =
        window.prompt(
          'Statut livraison: queued | assigned | picked_up | in_transit | delivered | failed | cancelled',
          order.deliveryStatus ?? 'in_transit',
        ) ?? ''
      const status = statusRaw.trim() as NonNullable<OnlineOrder['deliveryStatus']>
      if (
        ![
          'queued',
          'assigned',
          'picked_up',
          'in_transit',
          'delivered',
          'failed',
          'cancelled',
        ].includes(status)
      ) {
        toast.error('Statut livraison invalide')
        return
      }
      const rider =
        window.prompt('Nom du livreur (optionnel)', order.deliveryRiderName ?? '') ??
        ''
      const tracking =
        window.prompt(
          'Code de tracking (optionnel)',
          order.deliveryTrackingCode ?? '',
        ) ?? ''
      const etaMinutesRaw =
        window.prompt('ETA en minutes (optionnel)', '35') ?? ''
      const etaMinutes = Number.parseInt(etaMinutesRaw.trim(), 10)
      setBusyOrderId(order.id)
      try {
        const fresh = await db.onlineOrders.get(order.id)
        if (!fresh || fresh.status !== 'approved') return
        await db.onlineOrders.put({
          ...fresh,
          deliveryStatus: status,
          deliveryRiderName: rider.trim() || undefined,
          deliveryTrackingCode: tracking.trim() || undefined,
          deliveryProvider: fresh.deliveryProvider ?? getDeliveryProviderDemo(),
          deliveryEtaAt:
            Number.isFinite(etaMinutes) && etaMinutes > 0
              ? Date.now() + etaMinutes * 60_000
              : undefined,
          deliveryLastEvent: `Statut ${status}${tracking.trim() ? ` · Tracking ${tracking.trim()}` : ''}`,
          deliveryUpdatedAt: Date.now(),
        })
        toast.success('Livraison mise à jour', deliveryStatusLabel(status))
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, toast],
  )

  const updateKitchen = useCallback(
    async (order: OnlineOrder) => {
      if (busyOrderId) return
      const statusRaw =
        window.prompt(
          'Statut cuisine: queued | preparing | ready | served | cancelled',
          order.kitchenStatus ?? 'preparing',
        ) ?? ''
      const status = statusRaw.trim() as NonNullable<OnlineOrder['kitchenStatus']>
      if (!['queued', 'preparing', 'ready', 'served', 'cancelled'].includes(status)) {
        toast.error('Statut cuisine invalide')
        return
      }
      const station =
        window.prompt('Station cuisine', order.kitchenStation ?? getKitchenStationDemo()) ??
        ''
      setBusyOrderId(order.id)
      try {
        const fresh = await db.onlineOrders.get(order.id)
        if (!fresh || fresh.status !== 'approved') return
        await db.onlineOrders.put({
          ...fresh,
          kitchenStatus: status,
          kitchenStation: station.trim() || undefined,
          kitchenUpdatedAt: Date.now(),
          kitchenTicketCode:
            fresh.kitchenTicketCode ?? `K-${fresh.id.slice(0, 6).toUpperCase()}`,
        })
        toast.success('Cuisine mise à jour', kitchenStatusLabel(status))
      } finally {
        setBusyOrderId(null)
      }
    },
    [busyOrderId, toast],
  )

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconOnlineOrders />}
        eyebrow="Commandes"
        title={`${pending.length} commande${pending.length > 1 ? 's' : ''} en attente`}
        subtitle="Boutique, click & collect, WhatsApp et marketplaces — un seul stock"
      />

      {!canValidateOnlineOrders ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          <span className="font-semibold">Profil caissier :</span> vous pouvez
          rechercher, exporter et imprimer les reçus. Contactez un gérant pour
          valider ou rejeter une commande.
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Boutique en ligne
            </p>
            <p className="text-lg font-semibold text-zinc-900">
              {
                filteredOrders.filter(
                  (o) => o.sourcePlatform === 'web_storefront',
                ).length
              }
            </p>
            <p className="text-[11px] text-zinc-500">commandes · même stock</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Click & collect
            </p>
            <p className="text-lg font-semibold text-zinc-900">
              {
                filteredOrders.filter(
                  (o) => (o.fulfillmentMode ?? 'pickup') !== 'delivery',
                ).length
              }
            </p>
            <p className="text-[11px] text-zinc-500">retraits magasin</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              WhatsApp
            </p>
            <p className="text-lg font-semibold text-zinc-900">
              {
                filteredOrders.filter((o) => o.sourcePlatform === 'whatsapp')
                  .length
              }
            </p>
            <p className="text-[11px] text-zinc-500">commandes liées catalogue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Marketplaces
            </p>
            <p className="text-lg font-semibold text-zinc-900">
              {
                filteredOrders.filter((o) =>
                  ['glovo', 'ubereats', 'jumia', 'shopify'].includes(
                    o.sourcePlatform ?? '',
                  ),
                ).length
              }
            </p>
            <p className="text-[11px] text-zinc-500">Glovo · Uber · Jumia · Shopify</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <span className="mb-1 block text-[11px] font-medium text-zinc-600">
            Recherche client, téléphone ou référence
          </span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex. Kouassi, 07…, A1B2C3D4"
            iconLeft={<IconSearch />}
            aria-label="Filtrer les commandes"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
          {canSwitchStore ? (
            <Switch
              checked={allStores}
              onChange={(e) => {
                setAllStores(e.target.checked)
                setReviewedLimit(20)
              }}
              label="Tous les magasins"
              description={
                allStores
                  ? 'Vue réseau'
                  : `Filtré : ${activeStoreLabel}`
              }
            />
          ) : (
            <p className="text-[12px] text-zinc-500">
              Magasin :{' '}
              <span className="font-medium text-zinc-800">{activeStoreLabel}</span>
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconLeft={<IconDownload />}
            onClick={exportOrdersCsv}
            disabled={filteredOrders.length === 0}
            className="w-full sm:w-auto"
          >
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <SectionHeader
            title="Omnicanal · WhatsApp & marketplaces"
            subtitle="Articles du catalogue → même stock que la caisse et la boutique en ligne"
          />
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Input
              value={importCustomer}
              onChange={(e) => setImportCustomer(e.target.value)}
              placeholder="Client"
              aria-label="Client commande distante"
            />
            <Input
              value={importPhone}
              onChange={(e) => setImportPhone(e.target.value)}
              placeholder="Téléphone"
              aria-label="Téléphone commande distante"
            />
            <Input
              value={importAddress}
              onChange={(e) => setImportAddress(e.target.value)}
              placeholder="Adresse (si livraison)"
              aria-label="Adresse commande distante"
            />
            <Input
              value={importExternalRef}
              onChange={(e) => setImportExternalRef(e.target.value)}
              placeholder="Réf externe (optionnel)"
              aria-label="Référence externe"
            />
            <Select
              value={importPlatform}
              onChange={(e) =>
                setImportPlatform(e.target.value as OnlineOrderPlatform)
              }
              aria-label="Plateforme"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="glovo">Glovo</option>
              <option value="ubereats">Uber Eats</option>
              <option value="jumia">Jumia Food</option>
              <option value="shopify">Shopify</option>
              <option value="native">Canal direct</option>
            </Select>
            <Select
              value={importFulfillment}
              onChange={(e) =>
                setImportFulfillment(e.target.value as 'pickup' | 'delivery')
              }
              aria-label="Mode"
            >
              <option value="pickup">Click & collect</option>
              <option value="delivery">Livraison</option>
            </Select>
            <Select
              value={importProductId}
              onChange={(e) => setImportProductId(e.target.value)}
              aria-label="Produit catalogue"
            >
              <option value="">Choisir un produit…</option>
              {activeCatalog.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatFCFA(p.priceTTC)}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                value={importQty}
                onChange={(e) => setImportQty(e.target.value)}
                placeholder="Qté"
                aria-label="Quantité"
                className="max-w-[5.5rem]"
              />
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={addImportLine}
              >
                Ajouter
              </Button>
            </div>
          </div>
          {importLines.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[12px]">
              {importLines.map((line) => (
                <li
                  key={line.productId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 truncate">
                    {line.qty}× {line.name}
                  </span>
                  <span className="shrink-0 font-mono-nums text-zinc-600">
                    {formatFCFA(line.unitPriceTTC * line.qty)}
                  </span>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-rose-600"
                    onClick={() =>
                      setImportLines((prev) =>
                        prev.filter((l) => l.productId !== line.productId),
                      )
                    }
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-zinc-500">
              Ajoutez des produits du catalogue pour réserver le stock omnicanal.
            </p>
          )}
          <Button
            className="w-full sm:w-auto"
            variant="accent"
            onClick={() => void importRemoteOrder()}
            disabled={importLines.length === 0}
          >
            Créer la commande omnicanal
          </Button>
          {platformBreakdown.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {platformBreakdown.map(([name, count]) => (
                <Badge key={name} tone="info">
                  {name}: {count}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <SectionHeader title="À valider" />
      {pending.length === 0 ? (
        <EmptyState
          icon={<IconOnlineOrders />}
          title="Aucune commande en attente"
          description={
            search.trim()
              ? 'Aucun résultat pour cette recherche dans la sélection actuelle.'
              : 'Les nouvelles commandes web apparaîtront ici.'
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pending.map((order) => {
            const busy = busyOrderId === order.id
            return (
              <Card key={order.id} hover>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="ui-eyebrow">
                        Réf. {order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <h3 className="mt-0.5 truncate text-[14px] font-semibold text-zinc-900">
                        {order.customerName}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {formatDateTime(order.createdAt)} ·{' '}
                        {order.storeName ?? 'Magasin'}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="info">{platformLabel(order.sourcePlatform)}</Badge>
                        {order.externalOrderRef ? (
                          <span className="font-mono-nums text-[10px] text-zinc-500">
                            #{order.externalOrderRef}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono-nums text-[15px] font-bold text-zinc-900">
                        {formatFCFA(order.totalTTC)}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {paymentLabel(order.paymentMethod)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[12px] text-zinc-700">
                    <p>
                      <span className="text-zinc-500">Tél :</span>{' '}
                      {order.customerPhone || 'non renseigné'}
                    </p>
                    <p>
                      <span className="text-zinc-500">Adresse :</span>{' '}
                      {order.customerAddress || 'non renseignée'}
                    </p>
                    {order.desiredTimeSlot ? (
                      <p>
                        <span className="text-zinc-500">Créneau souhaité :</span>{' '}
                        {order.desiredTimeSlot}
                      </p>
                    ) : null}
                    {order.customerNote ? (
                      <p>
                        <span className="text-zinc-500">Note client :</span>{' '}
                        {order.customerNote}
                      </p>
                    ) : null}
                    {order.customerMessage ? (
                      <p>
                        <span className="text-zinc-500">Message client :</span>{' '}
                        {order.customerMessage}
                      </p>
                    ) : null}
                    {order.internalMessage ? (
                      <p>
                        <span className="text-zinc-500">Note interne :</span>{' '}
                        {order.internalMessage}
                      </p>
                    ) : null}
                    {order.messageUpdatedAt ? (
                      <p className="text-[11px] text-zinc-500">
                        Messages MAJ le {formatDateTime(order.messageUpdatedAt)}
                        {order.messageUpdatedByDisplayName
                          ? ` · ${order.messageUpdatedByDisplayName}`
                          : ''}
                      </p>
                    ) : null}
                    {order.customerNotificationStatus ? (
                      <p className="text-[11px] text-zinc-500">
                        Notification client:{' '}
                        {order.customerNotificationStatus === 'sent'
                          ? 'SMS envoye'
                          : 'echec envoi SMS'}
                        {order.customerNotifiedAt
                          ? ` · ${formatDateTime(order.customerNotifiedAt)}`
                          : ''}
                        {order.customerNotificationError &&
                        order.customerNotificationStatus === 'failed'
                          ? ` · ${order.customerNotificationError}`
                          : ''}
                      </p>
                    ) : null}
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <IconTruck className="h-3 w-3" />
                      {omnichannelFulfillmentLabel(order.fulfillmentMode)}
                      {order.discountPct ? (
                        <>
                          {' · '}Promo {order.promoCode ?? ''} ({order.discountPct} %)
                        </>
                      ) : null}
                      {order.deliveryFeeTTC ? (
                        <>
                          {' · '}Livraison
                          {order.deliveryZoneName
                            ? ` ${order.deliveryZoneName}`
                            : ''}{' '}
                          {formatFCFA(order.deliveryFeeTTC)}
                        </>
                      ) : order.deliveryZoneName ? (
                        <> · Zone {order.deliveryZoneName}</>
                      ) : null}
                    </p>
                  </div>

                  <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                    {order.lines.map((line) => (
                      <li
                        key={`${order.id}-${line.productId}`}
                        className="flex items-start justify-between gap-2 px-3 py-1.5 text-[12px]"
                      >
                        <span className="min-w-0 flex-1 truncate text-zinc-700">
                          {line.name}
                        </span>
                        <span className="ml-2 shrink-0 whitespace-nowrap font-mono-nums font-medium text-zinc-900">
                          {line.qty} × {formatFCFA(line.unitPriceTTC)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <Button
                      variant="secondary"
                      iconLeft={<IconPrinter />}
                      disabled={busy}
                      onClick={() => onPrintOrder(order, false)}
                      className="w-full sm:w-auto"
                    >
                      Reçu
                    </Button>
                    {canValidateOnlineOrders ? (
                      <Button
                        variant="ghost"
                        iconLeft={<IconInfo />}
                        disabled={busy}
                        onClick={() => void editOrderMessages(order)}
                        className="w-full sm:w-auto"
                      >
                        Message
                      </Button>
                    ) : null}
                    {canValidateOnlineOrders ? (
                      <Button
                        variant="ghost"
                        iconLeft={<IconEdit />}
                        disabled={busy}
                        onClick={() => void editOrder(order)}
                        className="w-full sm:w-auto"
                      >
                        Corriger
                      </Button>
                    ) : null}
                    {canValidateOnlineOrders ? (
                      <Button
                        variant="ghost"
                        iconLeft={<IconEdit />}
                        disabled={busy}
                        onClick={() => void editOrderLines(order)}
                        className="w-full sm:w-auto"
                      >
                        Corriger lignes
                      </Button>
                    ) : null}
                    {canValidateOnlineOrders ? (
                      <>
                        <Button
                          variant="accent"
                          iconLeft={<IconCheck />}
                          loading={busy}
                          onClick={() => void approveOrder(order)}
                          className="w-full sm:w-auto"
                        >
                          Valider
                        </Button>
                        <Button
                          variant="ghost"
                          iconLeft={<IconClose />}
                          disabled={busy}
                          onClick={() => void rejectOrder(order)}
                          className="w-full sm:w-auto"
                        >
                          Rejeter
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <SectionHeader title="Production cuisine" />
      {kitchenOrders.length === 0 ? (
        <EmptyState
          title="Aucun ticket cuisine"
          description="Les commandes validées apparaîtront ici."
          variant="flat"
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {kitchenOrders.map((order) => {
            const busy = busyOrderId === order.id
            return (
              <Card key={`kitchen-${order.id}`}>
                <CardContent className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-zinc-900">
                      {order.customerName}{' '}
                      <span className="font-mono-nums text-zinc-500">
                        ({order.kitchenTicketCode ?? order.id.slice(0, 8).toUpperCase()})
                      </span>
                    </p>
                    <Badge
                      tone={
                        order.kitchenStatus === 'served'
                          ? 'success'
                          : order.kitchenStatus === 'cancelled'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {kitchenStatusLabel(order.kitchenStatus)}
                    </Badge>
                  </div>
                  <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[12px] text-zinc-600">
                    Station: {order.kitchenStation ?? '—'} ·{' '}
                    {omnichannelFulfillmentLabel(order.fulfillmentMode)}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() => void updateKitchen(order)}
                      className="w-full sm:w-auto"
                    >
                      Mettre à jour cuisine
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<IconPrinter />}
                      onClick={() => onPrintOrder(order, false)}
                      className="w-full sm:w-auto"
                    >
                      Ticket
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <SectionHeader title="Suivi livraisons" />
      {deliveryOrders.length === 0 ? (
        <EmptyState
          title="Aucune livraison en cours"
          description="Les commandes livraison validées apparaîtront ici."
          variant="flat"
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {deliveryOrders.map((order) => {
            const busy = busyOrderId === order.id
            return (
              <Card key={`delivery-${order.id}`}>
                <CardContent className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-zinc-900">
                      {order.customerName}{' '}
                      <span className="font-mono-nums text-zinc-500">
                        ({order.id.slice(0, 8).toUpperCase()})
                      </span>
                    </p>
                    <Badge
                      tone={
                        order.deliveryStatus === 'delivered'
                          ? 'success'
                          : order.deliveryStatus === 'failed' ||
                              order.deliveryStatus === 'cancelled'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {deliveryStatusLabel(order.deliveryStatus)}
                    </Badge>
                  </div>
                  <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[12px] text-zinc-600">
                    Prestataire: {order.deliveryProvider ?? 'Non défini'} ·{' '}
                    Tracking: {order.deliveryTrackingCode ?? '—'} · Livreur:{' '}
                    {order.deliveryRiderName ?? '—'}
                    {order.deliveryEtaAt ? (
                      <>
                        {' · '}ETA:{' '}
                        {new Date(order.deliveryEtaAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </>
                    ) : null}
                  </p>
                  {order.deliveryLastEvent ? (
                    <p className="text-[11px] text-zinc-500">{order.deliveryLastEvent}</p>
                  ) : null}
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <Button
                      size="sm"
                      variant="secondary"
                      iconLeft={<IconTruck />}
                      loading={busy}
                      onClick={() => void updateDelivery(order)}
                      className="w-full sm:w-auto"
                    >
                      Mettre à jour
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<IconPrinter />}
                      onClick={() => onPrintOrder(order, false)}
                      className="w-full sm:w-auto"
                    >
                      Reçu
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <SectionHeader title="Historique récent" />
      {reviewedSorted.length === 0 ? (
        <EmptyState
          title="Aucun historique"
          description={
            search.trim()
              ? 'Aucune commande traitée ne correspond à la recherche.'
              : 'Les commandes traitées apparaîtront ici.'
          }
          variant="flat"
        />
      ) : (
        <Card>
          <CardContent className="p-0!">
            <ul className="divide-y divide-zinc-100">
              {reviewedVisible.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px] sm:px-4"
                >
                  <span className="min-w-0 truncate font-medium text-zinc-800">
                    <span className="font-mono-nums text-zinc-500">
                      {order.id.slice(0, 8).toUpperCase()}
                    </span>{' '}
                    · {order.customerName}
                    <span className="ml-2 font-mono-nums text-zinc-500">
                      {formatFCFA(order.totalTTC)}
                    </span>
                    {order.customerMessage || order.internalMessage ? (
                      <span className="ml-2 text-[11px] text-zinc-500">
                        · Message
                      </span>
                    ) : null}
                    {order.customerNotificationStatus ? (
                      <span
                        className={`ml-2 text-[11px] ${
                          order.customerNotificationStatus === 'sent'
                            ? 'text-emerald-600'
                            : 'text-amber-600'
                        }`}
                      >
                        · SMS{' '}
                        {order.customerNotificationStatus === 'sent'
                          ? 'envoye'
                          : 'echec'}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<IconPrinter />}
                      onClick={() => onPrintOrder(order, false)}
                      aria-label="Imprimer le reçu"
                    >
                      Reçu
                    </Button>
                    {canValidateOnlineOrders ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<IconInfo />}
                        onClick={() => void editOrderMessages(order)}
                        aria-label="Modifier les messages"
                      >
                        Message
                      </Button>
                    ) : null}
                    {canValidateOnlineOrders ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<IconEdit />}
                        onClick={() => void editOrder(order)}
                        aria-label="Corriger la commande"
                      >
                        Corriger
                      </Button>
                    ) : null}
                    {canValidateOnlineOrders ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<IconEdit />}
                        onClick={() => void editOrderLines(order)}
                        aria-label="Corriger les lignes"
                      >
                        Corriger lignes
                      </Button>
                    ) : null}
                    <Badge tone={order.status === 'approved' ? 'success' : 'danger'}>
                      {order.status === 'approved' ? 'Validée' : 'Rejetée'}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
            {hasMoreReviewed ? (
              <div className="border-t border-zinc-100 p-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => setReviewedLimit((n) => n + 20)}
                >
                  Afficher 20 de plus (
                  {reviewedSorted.length - reviewedLimit}{' '}
                  masquée
                  {reviewedSorted.length - reviewedLimit > 1 ? 's' : ''})
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
      {messageOrder ? (
        <OnlineOrderMessageModal
          order={messageOrder}
          history={messageHistory}
          busy={busyOrderId === messageOrder.id}
          onClose={() => setMessageOrderId(null)}
          onSave={(payload) => saveOrderMessages(messageOrder, payload)}
        />
      ) : null}
    </div>
  )
}
