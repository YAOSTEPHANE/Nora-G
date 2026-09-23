import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OnlineOrder, Sale, TicketInvoice } from '../db/types'
import { getAppSettings } from '../lib/appSettings'
import { formatFCFA, vatSlicesFromLinesTTC } from '../lib/money'
import {
  describeSalePayment,
  mobileMoneyLineLabel,
  salePaymentAmounts,
  saleMobilePhone,
} from '../lib/paymentDisplay'
import {
  printReceipt as printReceiptJob,
  isToplinkEscPosReady,
  kickCashDrawer,
  CASH_DRAWER_WINDOWS_HINT,
} from '../lib/printer/printReceipt'
import { connectToplinkPrinter } from '../lib/printer/toplinkSerial'
import { buildBrowserReceiptHtml } from '../lib/printer/browserReceiptHtml'
import {
  getReceiptBusinessName,
  receiptDocumentLabel,
} from '../lib/receiptBusinessName'
import { saleNetTTC } from '../lib/refundMath'
import { SESSION_ID } from '../lib/session'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { IconPrinter } from '../ui/icons'

export type ReceiptModalSource =
  | { kind: 'sale'; sale: Sale }
  | { kind: 'onlineOrder'; order: OnlineOrder }
  | { kind: 'ticketInvoice'; ticketInvoice: TicketInvoice }

type Props = {
  source: ReceiptModalSource
  autoPrint?: boolean
  onClose: () => void
}

function syntheticSaleFromOnlineOrder(order: OnlineOrder): Sale {
  return {
    id: order.id,
    createdAt: order.createdAt,
    lines: order.lines,
    subtotalHT: order.subtotalHT,
    tva: order.tva,
    totalTTC: order.totalTTC,
    discountPct: order.discountPct ?? 0,
    paymentMethod: order.paymentMethod,
    synced: false,
    storeId: order.storeId,
    storeName: order.storeName,
  }
}

function syntheticSaleFromTicketInvoice(doc: TicketInvoice): Sale {
  return {
    id: doc.id,
    createdAt: doc.createdAt,
    lines: doc.lines,
    subtotalHT: doc.subtotalHT,
    tva: doc.tva,
    totalTTC: doc.totalTTC,
    discountPct: 0,
    paymentMethod: 'cash',
    synced: false,
    storeId: doc.storeId,
    storeName: doc.storeName,
    cashierProfileId: doc.createdByProfileId,
    cashierDisplayName: doc.createdByDisplayName,
  }
}

function onlineOrderPaymentCaption(method: OnlineOrder['paymentMethod']): string {
  switch (method) {
    case 'cash':
      return 'Espèces à la livraison / au retrait'
    case 'card':
      return 'Carte bancaire'
    case 'mobile':
      return 'Mobile money'
    default:
      return 'Paiement mixte'
  }
}

function onlineOrderStatusLabel(status: OnlineOrder['status']): string {
  switch (status) {
    case 'pending':
      return 'En attente de validation'
    case 'approved':
      return 'Validée'
    case 'rejected':
      return 'Rejetée'
  }
}

export function ReceiptModal({ source, autoPrint = false, onClose }: Props) {
  const toast = useToast()
  const autoPrintedReceiptRef = useRef<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [serialBusy, setSerialBusy] = useState(false)
  const [drawerOpenedOk, setDrawerOpenedOk] = useState<boolean | null>(null)
  const isOnline = source.kind === 'onlineOrder'
  const isTicketInvoice = source.kind === 'ticketInvoice'
  const order = isOnline ? source.order : null
  const ticketInvoice = isTicketInvoice ? source.ticketInvoice : null
  const sale = useMemo(
    () => {
      if (source.kind === 'sale') return source.sale
      if (source.kind === 'onlineOrder') return syntheticSaleFromOnlineOrder(source.order)
      return syntheticSaleFromTicketInvoice(source.ticketInvoice)
    },
    [source],
  )

  const receiptKey =
    source.kind === 'sale'
      ? source.sale.id
      : source.kind === 'onlineOrder'
        ? source.order.id
        : source.ticketInvoice.id
  const dtLabel = useMemo(
    () =>
      new Date(sale.createdAt).toLocaleString('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [sale.createdAt],
  )
  const amt = salePaymentAmounts(sale)
  /** Tiroir auto uniquement s’il y a de la monnaie à rendre. */
  const needsCashDrawer = (sale.changeDue ?? 0) > 0
  const vatSlices = vatSlicesFromLinesTTC(sale.lines, sale.discountPct)
  const modalTitle = isOnline
    ? 'Reçu commande en ligne'
    : isTicketInvoice
      ? ticketInvoice?.kind === 'facture'
        ? 'Facture'
        : 'Reçu'
      : 'Reçu de vente'
  const businessName = getReceiptBusinessName()
  const documentLabel = isOnline
    ? receiptDocumentLabel('onlineOrder')
    : isTicketInvoice
      ? receiptDocumentLabel(
          ticketInvoice?.kind === 'facture' ? 'facture' : 'ticket',
        )
      : sale.fne?.invoiceNumber
        ? receiptDocumentLabel('fne')
        : receiptDocumentLabel('sale')

  const printViaBrowser = useCallback(async () => {
    const printFrame = document.createElement('iframe')
    printFrame.setAttribute('title', 'Impression ticket')
    // Dimensionne hors ecran : un iframe 1x1 produit souvent une page POS blanche.
    printFrame.style.position = 'fixed'
    printFrame.style.left = '0'
    printFrame.style.top = '0'
    printFrame.style.width = '58mm'
    printFrame.style.height = '1px'
    printFrame.style.opacity = '0.01'
    printFrame.style.pointerEvents = 'none'
    printFrame.style.border = '0'
    printFrame.style.zIndex = '-1'
    printFrame.setAttribute('aria-hidden', 'true')
    document.body.appendChild(printFrame)
    const frameWindow = printFrame.contentWindow
    if (!frameWindow) {
      printFrame.remove()
      return
    }

    const html = buildBrowserReceiptHtml({
      sale,
      businessName,
      documentLabel,
      dtLabel,
      vatSlices,
      amounts: amt,
      ticketInvoice,
      paperWidth: '58mm',
    })

    const cleanup = () => {
      window.setTimeout(() => {
        try {
          printFrame.remove()
        } catch {
          /* ignore */
        }
      }, 60_000)
    }

    const triggerPrint = () => {
      try {
        const bodyText = frameWindow.document.body?.innerText?.trim() ?? ''
        if (!bodyText) {
          toast.error('Impression', 'Ticket vide — réessayez via le bouton Imprimer.')
          printFrame.remove()
          return
        }
        // Ajuste la hauteur a la contenu reel (evite une page trop haute = bande blanche).
        const contentHeight = Math.ceil(
          Math.max(
            frameWindow.document.body.scrollHeight,
            frameWindow.document.documentElement.scrollHeight,
          ),
        )
        printFrame.style.height = `${Math.max(contentHeight, 32)}px`
        frameWindow.focus()
        frameWindow.addEventListener('afterprint', cleanup, { once: true })
        frameWindow.print()
        cleanup()
      } catch {
        printFrame.remove()
      }
    }

    const waitImagesThenPrint = () => {
      const images = [...frameWindow.document.images]
      if (images.length === 0) {
        window.setTimeout(triggerPrint, 150)
        return
      }
      let pending = images.length
      const done = () => {
        pending -= 1
        if (pending <= 0) window.setTimeout(triggerPrint, 80)
      }
      for (const img of images) {
        if (img.complete) {
          done()
          continue
        }
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      }
    }

    printFrame.addEventListener('load', waitImagesThenPrint)
    frameWindow.document.open()
    frameWindow.document.write(html)
    frameWindow.document.close()
  }, [
    amt,
    businessName,
    documentLabel,
    dtLabel,
    sale,
    ticketInvoice,
    toast,
    vatSlices,
  ])
  const printReceipt = useCallback(async () => {
    if (printing) return
    setPrinting(true)
    try {
      const escposReady = await Promise.race([
        isToplinkEscPosReady(),
        new Promise<boolean>((resolve) => {
          window.setTimeout(() => resolve(false), 2000)
        }),
      ])
      const result = await printReceiptJob(source, {
        openCashDrawer: needsCashDrawer,
        preferBrowser: !escposReady,
        browserFallback: printViaBrowser,
      })
      if (needsCashDrawer) {
        setDrawerOpenedOk(result.drawerOpened === true)
      }
      if (result.mode === 'escpos') {
        toast.success('Ticket imprimé', result.message)
      } else {
        toast.info(
          'Impression',
          'Si le dialogue ne s’ouvre pas, cliquez Imprimer (bloqueurs Chrome).',
        )
        if (needsCashDrawer && result.drawerOpened === false) {
          toast.warning(
            'Tiroir-caisse',
            'Cliquez « Connecter USB » ci-dessous (COM3), puis « Ouvrir tiroir ». ' +
              CASH_DRAWER_WINDOWS_HINT,
          )
        }
      }
    } catch (err) {
      toast.error(
        'Impression',
        err instanceof Error ? err.message : 'Erreur inconnue',
      )
      void printViaBrowser()
    } finally {
      setPrinting(false)
    }
  }, [needsCashDrawer, printing, printViaBrowser, source, toast])

  const printReceiptRef = useRef(printReceipt)
  printReceiptRef.current = printReceipt

  useEffect(() => {
    if (!autoPrint) return
    if (autoPrintedReceiptRef.current === receiptKey) return

    // Marquer seulement au moment du tir, pour ne pas annuler un retry
    // si les deps du callback changent pendant le court délai.
    const id = window.setTimeout(() => {
      if (autoPrintedReceiptRef.current === receiptKey) return
      autoPrintedReceiptRef.current = receiptKey
      // Toujours passer par printReceipt : le fallback navigateur y est géré
      // et kickCashDrawer reste tenté si un COM Web Serial est autorisé.
      void (async () => {
        await printReceiptRef.current()
      })()
    }, 50)

    return () => {
      window.clearTimeout(id)
    }
  }, [autoPrint, receiptKey, toast])

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={modalTitle}
      subtitle={`Réf. ${(ticketInvoice?.reference ?? sale.id.slice(0, 8)).toUpperCase()}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          {needsCashDrawer && drawerOpenedOk !== true ? (
            <>
              <Button
                variant="secondary"
                disabled={serialBusy || printing}
                onClick={() => {
                  setSerialBusy(true)
                  void connectToplinkPrinter()
                    .then(() => {
                      toast.success(
                        'USB lié',
                        'Port autorisé. Cliquez « Ouvrir tiroir ».',
                      )
                      return kickCashDrawer()
                    })
                    .then((ok) => {
                      setDrawerOpenedOk(ok === true)
                      if (ok) {
                        toast.success('Tiroir', 'Commande d’ouverture envoyée.')
                      } else {
                        toast.warning('Tiroir', CASH_DRAWER_WINDOWS_HINT)
                      }
                    })
                    .catch((err) =>
                      toast.error(
                        'USB / tiroir',
                        err instanceof Error ? err.message : 'Erreur',
                      ),
                    )
                    .finally(() => setSerialBusy(false))
                }}
              >
                {serialBusy ? 'USB…' : 'Connecter USB'}
              </Button>
              <Button
                variant="secondary"
                disabled={serialBusy || printing}
                onClick={() => {
                  setSerialBusy(true)
                  void kickCashDrawer()
                    .then((ok) => {
                      setDrawerOpenedOk(ok === true)
                      if (ok) {
                        toast.success('Tiroir', 'Commande d’ouverture envoyée.')
                      } else {
                        toast.warning(
                          'Tiroir',
                          'D’abord « Connecter USB » (COM3), puis réessayez.',
                        )
                      }
                    })
                    .catch((err) =>
                      toast.error(
                        'Tiroir',
                        err instanceof Error ? err.message : 'Erreur',
                      ),
                    )
                    .finally(() => setSerialBusy(false))
                }}
              >
                Ouvrir tiroir
              </Button>
            </>
          ) : null}
          <Button
            variant="primary"
            iconLeft={<IconPrinter />}
            disabled={printing}
            onClick={() => void printReceipt()}
          >
            {printing ? 'Impression…' : 'Imprimer'}
          </Button>
        </>
      }
    >
      <div id="print-receipt" className="space-y-4 text-zinc-800">
        <header className="border-b border-dashed border-zinc-200 pb-3 text-center">
          <p className="text-lg font-bold tracking-tight text-zinc-900">
            {businessName}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            {documentLabel}
          </p>
          <p className="mt-1.5 font-mono-nums text-[12px] text-zinc-500">{dtLabel}</p>
          {sale.fne?.invoiceNumber ? (
            <div className="mt-2 space-y-0.5 rounded-lg border border-[rgba(0,51,170,0.18)] bg-[#eef2fb] px-2 py-2 text-[11px] text-[#0033aa]">
              <p className="font-semibold tracking-wide">
                N° FNE · {sale.fne.invoiceNumber}
              </p>
              {sale.fne.nif ? (
                <p className="text-[10px] text-zinc-600">NIF · {sale.fne.nif}</p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-1 font-mono-nums text-[10px] text-zinc-500">
            Session #{SESSION_ID}
          </p>
          {order ? (
            <div className="mt-2 space-y-1 rounded-lg bg-zinc-50 px-2 py-2 text-[11px] text-zinc-700">
              <p>
                <span className="text-zinc-500">Client :</span>{' '}
                <span className="font-semibold text-zinc-900">{order.customerName}</span>
              </p>
              {order.customerPhone ? (
                <p>
                  <span className="text-zinc-500">Tél. :</span> {order.customerPhone}
                </p>
              ) : null}
              {order.customerAddress ? (
                <p>
                  <span className="text-zinc-500">Adresse :</span> {order.customerAddress}
                </p>
              ) : null}
              <p className="text-zinc-600">
                {order.fulfillmentMode === 'delivery' ? 'Livraison' : 'Click & collect'}
                {' · '}
                <span className="font-medium">{onlineOrderStatusLabel(order.status)}</span>
              </p>
            </div>
          ) : null}
          {ticketInvoice ? (
            <div className="mt-2 space-y-1 rounded-lg bg-zinc-50 px-2 py-2 text-[11px] text-zinc-700">
              <p>
                <span className="text-zinc-500">Référence :</span>{' '}
                <span className="font-semibold text-zinc-900">{ticketInvoice.reference}</span>
              </p>
              <p>
                <span className="text-zinc-500">Client :</span>{' '}
                <span className="font-semibold text-zinc-900">
                  {ticketInvoice.customerName ?? 'Client comptoir'}
                </span>
              </p>
              {ticketInvoice.customerPhone ? (
                <p>
                  <span className="text-zinc-500">Tél. :</span> {ticketInvoice.customerPhone}
                </p>
              ) : null}
              {ticketInvoice.dueAt ? (
                <p>
                  <span className="text-zinc-500">Échéance :</span>{' '}
                  {new Date(ticketInvoice.dueAt).toLocaleDateString('fr-FR')}
                </p>
              ) : null}
              {ticketInvoice.notes ? (
                <p>
                  <span className="text-zinc-500">Note :</span> {ticketInvoice.notes}
                </p>
              ) : null}
              {ticketInvoice.updatedByDisplayName ? (
                <p>
                  <span className="text-zinc-500">Modifié par :</span>{' '}
                  <span className="font-semibold text-zinc-900">
                    {ticketInvoice.updatedByDisplayName}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          {sale.cashierDisplayName ? (
            <p className="mt-1 text-[11px] text-zinc-600">
              Caissier :{' '}
              <span className="font-semibold text-zinc-800">
                {sale.cashierDisplayName}
              </span>
            </p>
          ) : null}
          {sale.storeName && sale.storeName.trim() !== businessName ? (
            <p className="text-[11px] text-zinc-600">
              Point de vente :{' '}
              <span className="font-semibold text-zinc-800">
                {sale.storeName}
              </span>
            </p>
          ) : null}
          {sale.tableName ? (
            <p className="text-[11px] text-zinc-600">
              Table :{' '}
              <span className="font-semibold text-zinc-800">{sale.tableName}</span>
            </p>
          ) : null}
        </header>

        <ul className="space-y-2 text-[13px]">
          {sale.lines.map((line) => (
            <li
              key={`${line.productId}-${line.name}`}
              className="flex justify-between gap-2 border-b border-zinc-100 pb-2"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{line.name}</span>
                <span className="block font-mono-nums text-[11px] text-zinc-500">
                  {formatFCFA(line.unitPriceTTC)} × {line.qty}
                </span>
              </span>
              <span className="shrink-0 font-mono-nums font-semibold">
                {formatFCFA(line.unitPriceTTC * line.qty)}
              </span>
            </li>
          ))}
        </ul>

        {sale.discountPct > 0 ? (
          <p className="text-[11px] text-emerald-700">
            Remise appliquée : {sale.discountPct} %
            {order?.promoCode ? (
              <span className="font-mono text-zinc-600"> · {order.promoCode}</span>
            ) : null}
          </p>
        ) : null}

        {order && order.deliveryFeeTTC && order.deliveryFeeTTC > 0 ? (
          <p className="text-[11px] text-zinc-600">
            Frais de livraison TTC :{' '}
            <span className="font-mono-nums font-semibold text-zinc-800">
              {formatFCFA(order.deliveryFeeTTC)}
            </span>
          </p>
        ) : null}

        {(sale.refundsTotalTTC ?? 0) > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <p className="font-semibold">Remboursements (audit)</p>
            <p className="mt-0.5 font-mono-nums">
              Remboursé : {formatFCFA(sale.refundsTotalTTC ?? 0)} · CA net :{' '}
              {formatFCFA(saleNetTTC(sale))}
            </p>
          </div>
        ) : null}

        <div className="space-y-1 border-t border-dashed border-zinc-200 pt-3 font-mono-nums text-[13px]">
          <div className="flex justify-between text-zinc-600">
            <span>Sous-total HT</span>
            <span>{formatFCFA(sale.subtotalHT)}</span>
          </div>
          {vatSlices.map((s) => (
            <div key={s.ratePct} className="flex justify-between text-zinc-600">
              <span>TVA {s.ratePct} %</span>
              <span>{formatFCFA(s.tva)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-zinc-200 pt-2 text-[15px] font-bold text-zinc-900">
            <span>Total TTC</span>
            <span>{formatFCFA(sale.totalTTC)}</span>
          </div>
        </div>

        {!isTicketInvoice ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[13px]">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Paiement
          </p>
          <p className="mt-1 text-center font-semibold text-zinc-900">
            {order
              ? onlineOrderPaymentCaption(order.paymentMethod)
              : describeSalePayment(sale)}
          </p>
          <ul className="mt-2 space-y-1 font-mono-nums text-zinc-700">
            {amt.cash > 0 ? (
              <li className="flex justify-between">
                <span>Espèces (FCFA)</span>
                <span>{formatFCFA(amt.cash)}</span>
              </li>
            ) : null}
            {amt.card > 0 ? (
              <li className="flex justify-between">
                <span>Carte (TPE)</span>
                <span>{formatFCFA(amt.card)}</span>
              </li>
            ) : null}
            {amt.mobile > 0 ? (
              <li className="flex justify-between">
                <span>{mobileMoneyLineLabel(sale)}</span>
                <span>{formatFCFA(amt.mobile)}</span>
              </li>
            ) : null}
          </ul>
          {sale.cashReceived != null ? (
            <p className="mt-2 border-t border-zinc-200 pt-2 text-[11px] text-zinc-600">
              Reçu : {formatFCFA(sale.cashReceived)}
            </p>
          ) : null}
          {sale.changeDue != null && sale.changeDue > 0 ? (
            <p className="mt-0.5 text-[13px] font-bold text-emerald-700">
              Monnaie : {formatFCFA(sale.changeDue)}
            </p>
          ) : null}
          {sale.cardTpeReference ? (
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              Réf. TPE : {sale.cardTpeReference}
            </p>
          ) : null}
          {sale.mobileMoneyReference ? (
            <p className="font-mono text-[10px] text-zinc-500">
              Réf. mobile : {sale.mobileMoneyReference}
            </p>
          ) : null}
          {saleMobilePhone(sale) ? (
            <p className="font-mono text-[10px] text-zinc-500">
              Tél. : {saleMobilePhone(sale)}
            </p>
          ) : null}
          </div>
        ) : null}

        {order?.reviewedByDisplayName && order.status !== 'pending' ? (
          <p className="text-center text-[10px] text-zinc-500">
            Traité par {order.reviewedByDisplayName}
            {order.reviewedAt
              ? ` · ${new Date(order.reviewedAt).toLocaleString('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}`
              : null}
          </p>
        ) : null}

        <footer className="pt-2 text-center text-[10px] text-zinc-400">
          {isOnline
            ? 'Commande en ligne · Document non fiscal'
            : getAppSettings().receiptFooterLine}
        </footer>
      </div>
    </Modal>
  )
}
