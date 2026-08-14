import { db, ensureAllStoreStockRows, syncProductCategoriesFromProducts } from '../db/db'
import { DEFAULT_STORE_ID } from '../db/seedStores'
import type { Product, ProductCategory, ProductWithStock } from '../db/types'
import { PRODUCT_CATEGORY_LIST } from '../db/types'
import { downloadTextFile, toCsvSemicolon } from './analyticsExport'
import { findProductByBarcode } from './productBarcode'
import {
  normalizeProductDescription,
  normalizeProductHighlights,
} from './productDescription'
import { storeStockRowId } from './storeStockId'
import { enqueueProductSync } from './sync'

export const CSV_TEMPLATE = `nom;prix_ttc;prix_revient_ttc;code_barres;categorie;stock;seuil;tva_pct;archive;image_url;description;points_forts
Exemple boisson;1000;600;1234567890123;Boissons;0;5;18;;;Boisson rafraîchissante maison;Fait maison|Servi glacé
Autre exemple;500;;9876543210987;Epicerie fine;2;3;18;;;;;`

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
    } else if (!inQ && c === delimiter) {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur.trim())
  return out.map((cell) => {
    if (cell.startsWith('"') && cell.endsWith('"')) {
      return cell.slice(1, -1).replaceAll('""', '"')
    }
    return cell
  })
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) ?? []).length
  const semis = (headerLine.match(/;/g) ?? []).length
  return semis > commas ? ';' : ','
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

const HEADER_ALIASES: Record<string, keyof ParsedRowInput> = {
  nom: 'name',
  name: 'name',
  prix_ttc: 'priceTTC',
  price_ttc: 'priceTTC',
  prixttc: 'priceTTC',
  code_barres: 'barcode',
  barcode: 'barcode',
  ean: 'barcode',
  categorie: 'category',
  category: 'category',
  stock: 'stock',
  seuil: 'lowStockThreshold',
  low_stock_threshold: 'lowStockThreshold',
  threshold: 'lowStockThreshold',
  tva_pct: 'vatRatePct',
  tva: 'vatRatePct',
  vat_rate_pct: 'vatRatePct',
  vat: 'vatRatePct',
  archive: 'archived',
  archived: 'archived',
  image_url: 'imageUrl',
  image: 'imageUrl',
  prix_revient_ttc: 'purchasePriceTTC',
  prix_revient: 'purchasePriceTTC',
  purchase_price_ttc: 'purchasePriceTTC',
  cost_ttc: 'purchasePriceTTC',
  description: 'description',
  desc: 'description',
  details: 'description',
  points_forts: 'highlights',
  highlights: 'highlights',
  atouts: 'highlights',
}

type ParsedRowInput = {
  name?: string
  priceTTC?: string
  purchasePriceTTC?: string
  barcode?: string
  category?: string
  stock?: string
  lowStockThreshold?: string
  vatRatePct?: string
  archived?: string
  imageUrl?: string
  description?: string
  highlights?: string
}

export type CsvRowError = { line: number; message: string }

export type CsvImportSummary = {
  created: number
  updated: number
  errors: CsvRowError[]
}

function parseCategory(raw: string): ProductCategory | null {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return null
  if (PRODUCT_CATEGORY_LIST.includes(t)) {
    return t
  }
  const n = normHeader(t).replace(/_/g, '')
  const map: Record<string, ProductCategory> = {
    boissons: 'Boissons',
    alimentation: 'Alimentation',
    hygiene: 'Hygiène',
    hygienie: 'Hygiène',
    autre: 'Autre',
  }
  if (map[n]) return map[n]
  return t
}

function parseBoolArchive(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return false
  const s = raw.trim().toLowerCase()
  return (
    s === '1' ||
    s === 'oui' ||
    s === 'o' ||
    s === 'yes' ||
    s === 'true' ||
    s === 'x' ||
    s === 'archived' ||
    s === 'archive'
  )
}

function parseRows(text: string): { headers: string[]; rows: string[][]; delimiter: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: ',' }
  }
  const delimiter = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delimiter).map(normHeader)
  const rows: string[][] = []
  for (let i = 1; i < lines.length; i++) {
    rows.push(splitCsvLine(lines[i], delimiter))
  }
  return { headers, rows, delimiter }
}

function rowObject(
  headers: string[],
  cells: string[],
): ParsedRowInput {
  const o: ParsedRowInput = {}
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h]
    if (!key) return
    const v = cells[i]?.trim() ?? ''
    o[key] = v
  })
  return o
}

export type ParsedCsvProductRow = { product: Product; mainStoreStock: number }

function validateAndBuild(
  o: ParsedRowInput,
  lineIndex: number,
): ParsedCsvProductRow | { error: CsvRowError } {
  const name = o.name?.trim()
  if (!name) {
    return { error: { line: lineIndex, message: 'Nom manquant.' } }
  }
  const price = Number.parseInt(String(o.priceTTC).replace(/\s/g, ''), 10)
  if (!Number.isFinite(price) || price < 0) {
    return { error: { line: lineIndex, message: `Prix TTC invalide : ${o.priceTTC}` } }
  }
  let purchasePriceTTC: number | undefined
  const purRaw = o.purchasePriceTTC?.replace(/\s/g, '').trim()
  if (purRaw) {
    const p = Number.parseInt(purRaw, 10)
    if (!Number.isFinite(p) || p < 0) {
      return {
        error: {
          line: lineIndex,
          message: `Prix de revient TTC invalide : ${o.purchasePriceTTC}`,
        },
      }
    }
    purchasePriceTTC = p
  }
  const barcode = o.barcode?.trim()
  if (!barcode) {
    return { error: { line: lineIndex, message: 'Code-barres manquant.' } }
  }
  const cat = o.category ? parseCategory(o.category) : null
  if (!cat) {
    return {
      error: {
        line: lineIndex,
        message: `Catégorie invalide : ${o.category ?? '(vide)'}`,
      },
    }
  }
  const stock = Number.parseInt(String(o.stock ?? '0').replace(/\s/g, ''), 10)
  if (!Number.isFinite(stock) || stock < 0) {
    return { error: { line: lineIndex, message: `Stock invalide : ${o.stock}` } }
  }
  const lowTh = Number.parseInt(
    String(o.lowStockThreshold ?? '5').replace(/\s/g, ''),
    10,
  )
  if (!Number.isFinite(lowTh) || lowTh < 0) {
    return {
      error: { line: lineIndex, message: `Seuil invalide : ${o.lowStockThreshold}` },
    }
  }
  const vatRaw = o.vatRatePct?.trim()
  const vatRatePct = vatRaw
    ? Number.parseFloat(vatRaw.replace(',', '.'))
    : 18
  if (!Number.isFinite(vatRatePct) || vatRatePct < 0 || vatRatePct > 100) {
    return { error: { line: lineIndex, message: `TVA % invalide : ${o.vatRatePct}` } }
  }
  const archived = parseBoolArchive(o.archived)
  let imageDataUrl: string | undefined
  let imageUrl: string | undefined
  const img = o.imageUrl?.trim()
  if (img) {
    if (img.startsWith('data:')) {
      imageDataUrl = img
    } else if (img.startsWith('http://') || img.startsWith('https://')) {
      imageUrl = img
    } else {
      return {
        error: {
          line: lineIndex,
          message: 'image_url doit être une URL https ou une data URL.',
        },
      }
    }
  }
  const product: Product = {
    id: crypto.randomUUID(),
    name,
    priceTTC: price,
    category: cat,
    barcode,
    lowStockThreshold: lowTh,
    vatRatePct: Math.round(vatRatePct * 100) / 100,
    archived,
    ...(purchasePriceTTC !== undefined ? { purchasePriceTTC } : {}),
    ...(imageDataUrl ? { imageDataUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  }
  const description = normalizeProductDescription(o.description)
  const highlights = normalizeProductHighlights(o.highlights)
  if (description) product.description = description
  if (highlights) product.highlights = highlights
  return { product, mainStoreStock: stock }
}

/**
 * Analyse le CSV (séparateur , ou ;, en-têtes FR ou EN).
 */
export function parseProductsCsv(text: string): {
  errors: CsvRowError[]
  rows: ParsedCsvProductRow[]
} {
  const { headers, rows: dataRows } = parseRows(text)
  const errors: CsvRowError[] = []
  const rows: ParsedCsvProductRow[] = []
  if (headers.length === 0) {
    errors.push({ line: 0, message: 'Fichier vide ou sans en-tête.' })
    return { errors, rows: [] }
  }
  dataRows.forEach((cells, i) => {
    const lineNum = i + 2
    const o = rowObject(headers, cells)
    if (!o.name && !o.barcode && cells.every((c) => !c.trim())) return
    const r = validateAndBuild(o, lineNum)
    if ('error' in r) {
      errors.push(r.error)
      return
    }
    rows.push(r)
  })
  return { errors, rows }
}

/**
 * Importe en base : fusion par code-barres si demandé.
 * Le stock CSV est appliqué sur le magasin principal (`DEFAULT_STORE_ID`).
 */
export async function applyProductsCsvImport(
  parsed: ParsedCsvProductRow[],
  options: { updateExistingByBarcode: boolean },
): Promise<CsvImportSummary> {
  const errors: CsvRowError[] = []
  let created = 0
  let updated = 0

  await db.transaction('rw', db.products, db.storeStocks, async () => {
    for (let i = 0; i < parsed.length; i++) {
      const { product: p, mainStoreStock } = parsed[i]
      const existing = await findProductByBarcode(p.barcode)
      if (existing) {
        if (!options.updateExistingByBarcode) {
          errors.push({
            line: i + 2,
            message: `Code-barres déjà utilisé : ${p.barcode}`,
          })
          continue
        }
        const merged: Product = {
          ...existing,
          name: p.name,
          priceTTC: p.priceTTC,
          category: p.category,
          lowStockThreshold: p.lowStockThreshold,
          vatRatePct: p.vatRatePct,
          archived: p.archived,
        }
        if (p.imageUrl !== undefined) {
          merged.imageUrl = p.imageUrl
          delete merged.imageDataUrl
        } else if (p.imageDataUrl !== undefined) {
          merged.imageDataUrl = p.imageDataUrl
          delete merged.imageUrl
        }
        if (p.purchasePriceTTC !== undefined) {
          merged.purchasePriceTTC = p.purchasePriceTTC
        }
        if (p.description !== undefined) {
          if (p.description) merged.description = p.description
          else delete merged.description
        }
        if (p.highlights !== undefined) {
          if (p.highlights.length > 0) merged.highlights = p.highlights
          else delete merged.highlights
        }
        await db.products.put(merged)
        await enqueueProductSync({
          action: 'upsert',
          productId: merged.id,
          product: merged,
        })
        await db.storeStocks.put({
          id: storeStockRowId(DEFAULT_STORE_ID, merged.id),
          storeId: DEFAULT_STORE_ID,
          productId: merged.id,
          stock: mainStoreStock,
        })
        updated++
      } else {
        await db.products.add(p)
        await enqueueProductSync({
          action: 'upsert',
          productId: p.id,
          product: p,
        })
        await db.storeStocks.put({
          id: storeStockRowId(DEFAULT_STORE_ID, p.id),
          storeId: DEFAULT_STORE_ID,
          productId: p.id,
          stock: mainStoreStock,
        })
        created++
      }
    }
  })

  await ensureAllStoreStockRows()
  await syncProductCategoriesFromProducts()
  return { created, updated, errors }
}

export function downloadCsvTemplate(): void {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'nora-import-produits-modele.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/** Exporte les produits visibles (stock magasin actif inclus). */
export function exportProductsCsv(
  products: ProductWithStock[],
  filename: string,
): void {
  const header = [
    'nom',
    'prix_ttc',
    'prix_revient_ttc',
    'code_barres',
    'categorie',
    'stock',
    'seuil',
    'tva_pct',
    'archive',
    'image_url',
    'description',
    'points_forts',
  ]
  const rows = products.map((p) => [
    p.name,
    String(p.priceTTC),
    p.purchasePriceTTC != null ? String(p.purchasePriceTTC) : '',
    p.barcode,
    p.category,
    String(p.stock),
    String(p.lowStockThreshold),
    String(p.vatRatePct ?? 18),
    p.archived ? '1' : '',
    p.imageUrl ?? '',
    p.description ?? '',
    (p.highlights ?? []).join('|'),
  ])
  downloadTextFile(filename, toCsvSemicolon([header, ...rows]))
}
