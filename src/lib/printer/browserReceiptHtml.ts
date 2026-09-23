import { getAppSettings } from '../appSettings'
import { type VatSliceByRate } from '../money'
import type { Sale, TicketInvoice } from '../../db/types'
import { SESSION_ID } from '../session'

/** Largeur imprimable approximative pour rouleau 58 mm. */
export type ReceiptPaperWidth = '58mm' | '80mm'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** ASCII simple — les pilotes POS en mode graphique plantent souvent sur accents / flex. */
function toPrintable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    // Espaces fins / inseparables (fr-CI) → espace normal (sinon "?" dans 2 400)
    .replace(/[\u00A0\u202F\u2007\u2009\u200A\u2008]/g, ' ')
    .replace(/[œŒ]/g, (m) => (m === 'œ' ? 'oe' : 'OE'))
    .replace(/[æÆ]/g, (m) => (m === 'æ' ? 'ae' : 'AE'))
    .replace(/[€]/g, 'F')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?')
    .trim()
}

/** Montants courts pour 58 mm — chiffres ASCII purs, sans separateur locale. */
function formatPrintMoney(amount: number): string {
  return `${Math.round(amount)} F`
}

function line(label: string, value: string, fontSize: string): string {
  return `<tr>
  <td colspan="2" style="padding:2px 0;text-align:center;color:#000;font-size:${fontSize};">
    ${escapeHtml(toPrintable(label))} : <strong>${escapeHtml(toPrintable(value))}</strong>
  </td>
</tr>`
}

/**
 * HTML pour impression ticket thermique via pilote Windows (ZPrinter / POS).
 * Tables uniquement — pas de flex/grid (souvent = page bizarre / caractères parasites).
 */
export function buildBrowserReceiptHtml(input: {
  sale: Sale
  businessName: string
  documentLabel: string
  dtLabel: string
  vatSlices: VatSliceByRate[]
  amounts: { cash: number; card: number; mobile: number }
  ticketInvoice?: TicketInvoice | null
  paperWidth?: ReceiptPaperWidth
  /** Data URL ou URL absolue du logo (PNG recommandé pour les pilotes POS). */
  logoSrc?: string | null
}): string {
  const {
    sale,
    businessName,
    documentLabel,
    dtLabel,
    vatSlices,
    amounts,
    ticketInvoice,
    paperWidth = '58mm',
    logoSrc,
  } = input

  // Largeur ticket centree sur la page d'impression (evite tout a gauche).
  const bodyWidth = paperWidth === '58mm' ? '52mm' : '72mm'
  const fontSize = paperWidth === '58mm' ? '13px' : '15px'
  const smallSize = paperWidth === '58mm' ? '11px' : '13px'
  const titleSize = paperWidth === '58mm' ? '16px' : '18px'
  const logoMaxWidth = paperWidth === '58mm' ? '28mm' : '36mm'

  const linesHtml = sale.lines
    .map((item) => {
      const name = escapeHtml(toPrintable(item.name))
      const detail = escapeHtml(
        toPrintable(`${formatPrintMoney(item.unitPriceTTC)} x ${item.qty}`),
      )
      const total = escapeHtml(formatPrintMoney(item.unitPriceTTC * item.qty))
      return `<tr>
  <td colspan="2" style="padding:4px 0;text-align:center;color:#000;font-size:${fontSize};">
    <div style="font-weight:700;">${name}</div>
    <div style="font-size:${smallSize};margin-top:1px;">${detail}</div>
    <div style="font-weight:700;margin-top:1px;">${total}</div>
  </td>
</tr>`
    })
    .join('')

  const totalsRows = [
    line('Sous-tot HT', formatPrintMoney(sale.subtotalHT), fontSize),
    ...vatSlices.map((s) =>
      line(`TVA ${s.ratePct}%`, formatPrintMoney(s.tva), fontSize),
    ),
    line('TOTAL TTC', formatPrintMoney(sale.totalTTC), fontSize),
    amounts.cash > 0 ? line('Especes', formatPrintMoney(amounts.cash), fontSize) : '',
    amounts.card > 0 ? line('Carte', formatPrintMoney(amounts.card), fontSize) : '',
    amounts.mobile > 0
      ? line('Mobile', formatPrintMoney(amounts.mobile), fontSize)
      : '',
    sale.cashReceived != null
      ? line('Recu', formatPrintMoney(sale.cashReceived), fontSize)
      : '',
    sale.changeDue != null && sale.changeDue > 0
      ? line('Monnaie', formatPrintMoney(sale.changeDue), fontSize)
      : '',
  ].join('')

  const footerLine = escapeHtml(
    toPrintable(
      ticketInvoice?.notes?.trim() ||
        (sale.fne?.invoiceNumber
          ? `FNE · ${sale.fne.invoiceNumber}`
          : getAppSettings().receiptFooterLine),
    ),
  )
  const receiptRef = escapeHtml(
    toPrintable(
      (
        ticketInvoice?.reference ??
        sale.fne?.invoiceNumber ??
        sale.id.slice(0, 8)
      ).toUpperCase(),
    ),
  )

  const logoHtml =
    logoSrc &&
    (logoSrc.startsWith('data:image/') ||
      logoSrc.startsWith('https://') ||
      logoSrc.startsWith('http://') ||
      logoSrc.startsWith('/'))
      ? `<div style="text-align:center;margin:0 0 4px;">
        <img src="${escapeHtml(logoSrc)}" alt="" width="120" height="120" style="display:block;margin:0 auto;max-width:${logoMaxWidth};width:${logoMaxWidth};height:auto;" />
      </div>`
      : ''

  const headerBits = [
    logoHtml,
    `<div style="font-size:${titleSize};font-weight:700;color:#000;text-align:center;">${escapeHtml(toPrintable(businessName))}</div>`,
    `<div style="font-size:${fontSize};color:#000;margin-top:2px;text-align:center;">${escapeHtml(toPrintable(documentLabel))}</div>`,
    `<div style="font-size:${smallSize};color:#000;margin-top:2px;text-align:center;">${escapeHtml(toPrintable(dtLabel))}</div>`,
    `<div style="font-size:${smallSize};color:#000;text-align:center;">Session #${escapeHtml(String(SESSION_ID))}</div>`,
    `<div style="font-size:${fontSize};color:#000;margin-top:2px;text-align:center;">Ref. ${receiptRef}</div>`,
  ].filter(Boolean)
  if (sale.fne?.invoiceNumber) {
    headerBits.push(
      `<div style="font-size:${fontSize};font-weight:700;color:#000;margin-top:2px;text-align:center;">N° FNE : ${escapeHtml(toPrintable(sale.fne.invoiceNumber))}</div>`,
    )
    if (sale.fne.nif) {
      headerBits.push(
        `<div style="font-size:${smallSize};color:#000;text-align:center;">NIF : ${escapeHtml(toPrintable(sale.fne.nif))}</div>`,
      )
    }
  }
  if (sale.cashierDisplayName) {
    headerBits.push(
      `<div style="font-size:${smallSize};color:#000;text-align:center;">Caissier : ${escapeHtml(toPrintable(sale.cashierDisplayName))}</div>`,
    )
  }
  if (sale.storeName && sale.storeName.trim() !== businessName.trim()) {
    headerBits.push(
      `<div style="font-size:${smallSize};color:#000;text-align:center;">PV : ${escapeHtml(toPrintable(sale.storeName))}</div>`,
    )
  }
  if (sale.tableName) {
    headerBits.push(
      `<div style="font-size:${smallSize};color:#000;text-align:center;">Table : ${escapeHtml(toPrintable(sale.tableName))}</div>`,
    )
  }
  if (ticketInvoice?.customerName) {
    headerBits.push(
      `<div style="font-size:${smallSize};color:#000;text-align:center;">Client : ${escapeHtml(toPrintable(ticketInvoice.customerName))}</div>`,
    )
  }

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Ticket</title>
    <style>
      /* Pas de hauteur de page fixe : une page haute = longue bande blanche sur POS. */
      @page { margin: 0; size: ${paperWidth} auto; }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: auto !important;
        min-height: 0 !important;
        background: #fff;
        color: #000;
        font-family: Arial, Helvetica, sans-serif;
        text-align: center;
      }
      .ticket {
        display: block;
        width: ${bodyWidth};
        max-width: 100%;
        margin: 0 auto;
        padding: 2mm 1mm 2mm;
        box-sizing: border-box;
        text-align: center;
      }
      table {
        width: 100%;
        margin: 0 auto;
        border-collapse: collapse;
        table-layout: fixed;
      }
      td {
        vertical-align: top;
        word-wrap: break-word;
        overflow-wrap: anywhere;
        text-align: center;
      }
      @media print {
        html, body { height: auto !important; min-height: 0 !important; width: 100%; text-align: center; }
        .ticket { margin: 0 auto; }
      }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:4px;">
        ${headerBits.join('\n        ')}
      </div>
      <table style="margin-top:4px;">
        <tbody>${linesHtml}</tbody>
      </table>
      <table style="margin-top:4px;border-top:1px dashed #000;padding-top:4px;">
        <tbody>${totalsRows}</tbody>
      </table>
      <div style="margin-top:4px;text-align:center;font-size:${fontSize};color:#000;padding-bottom:2mm;">${footerLine}</div>
    </div>
  </body>
</html>`
}
