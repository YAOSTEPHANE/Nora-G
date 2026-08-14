import { db } from '../db/db'
import type {
  KitchenIngredient,
  KitchenIngredientStock,
  ProductRecipeIngredient,
  SaleLine,
} from '../db/types'

export type KitchenIngredientWithStock = KitchenIngredient & { stock: number }

export function kitchenIngredientStockRowId(
  storeId: string,
  ingredientId: string,
): string {
  return `${storeId}:${ingredientId}`
}

export function mergeKitchenIngredientRows(
  ingredients: KitchenIngredient[],
  stocks: KitchenIngredientStock[],
  storeId: string,
): KitchenIngredientWithStock[] {
  const stockByIngredient = new Map(
    stocks
      .filter((row) => row.storeId === storeId)
      .map((row) => [row.ingredientId, row.stock]),
  )
  return ingredients
    .map((ing) => ({
      ...ing,
      stock: stockByIngredient.get(ing.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export function kitchenIngredientStats(rows: KitchenIngredientWithStock[]) {
  const rupture = rows.filter((row) => row.stock <= 0).length
  const low = rows.filter(
    (row) => row.stock > 0 && row.stock <= row.lowStockThreshold,
  ).length
  const ok = rows.length - rupture - low
  return { rupture, low, ok, total: rows.length }
}

export function ingredientStatus(
  row: KitchenIngredientWithStock,
): 'rupture' | 'alerte' | 'ok' {
  if (row.stock <= 0) return 'rupture'
  if (row.stock <= row.lowStockThreshold) return 'alerte'
  return 'ok'
}

export function computeIngredientUsageFromLines(
  lines: SaleLine[],
  recipeRows: ProductRecipeIngredient[],
): Map<string, number> {
  const usage = new Map<string, number>()
  for (const line of lines) {
    const rows = recipeRows.filter((row) => row.productId === line.productId)
    for (const row of rows) {
      const used = row.qtyPerUnit * line.qty
      usage.set(row.ingredientId, (usage.get(row.ingredientId) ?? 0) + used)
    }
  }
  return usage
}

export function mergeIngredientUsage(
  target: Map<string, number>,
  addition: Map<string, number>,
): Map<string, number> {
  const next = new Map(target)
  for (const [ingredientId, qty] of addition.entries()) {
    next.set(ingredientId, (next.get(ingredientId) ?? 0) + qty)
  }
  return next
}

export async function validateKitchenIngredientStock(
  storeId: string,
  usage: Map<string, number>,
): Promise<void> {
  for (const [ingredientId, usedQty] of usage.entries()) {
    if (usedQty <= 0) continue
    const ingredient = await db.kitchenIngredients.get(ingredientId)
    if (!ingredient || ingredient.archived) continue
    const stockId = kitchenIngredientStockRowId(storeId, ingredientId)
    const stockRow = await db.kitchenIngredientStocks.get(stockId)
    const currentStock = stockRow?.stock ?? 0
    if (currentStock < usedQty) {
      throw new Error(
        `Stock cuisine insuffisant pour « ${ingredient.name} » (disponible: ${currentStock} ${ingredient.unit}, requis: ${Math.round(usedQty * 1000) / 1000} ${ingredient.unit}).`,
      )
    }
  }
}

export async function deductKitchenIngredientStock(
  storeId: string,
  usage: Map<string, number>,
): Promise<void> {
  for (const [ingredientId, usedQty] of usage.entries()) {
    if (usedQty <= 0) continue
    const ingredient = await db.kitchenIngredients.get(ingredientId)
    if (!ingredient || ingredient.archived) continue
    const stockId = kitchenIngredientStockRowId(storeId, ingredientId)
    const stockRow = await db.kitchenIngredientStocks.get(stockId)
    const currentStock = stockRow?.stock ?? 0
    await db.kitchenIngredientStocks.put({
      id: stockId,
      storeId,
      ingredientId,
      stock: Math.max(0, Math.round((currentStock - usedQty) * 1000) / 1000),
    })
  }
}

export async function deductKitchenIngredientStockForLines(
  storeId: string,
  lines: SaleLine[],
  recipeRows: ProductRecipeIngredient[],
): Promise<void> {
  const usage = computeIngredientUsageFromLines(lines, recipeRows)
  if (usage.size === 0) return
  await validateKitchenIngredientStock(storeId, usage)
  await deductKitchenIngredientStock(storeId, usage)
}

export async function adjustKitchenIngredientStock(
  storeId: string,
  ingredientId: string,
  nextStock: number,
): Promise<void> {
  await db.kitchenIngredientStocks.put({
    id: kitchenIngredientStockRowId(storeId, ingredientId),
    storeId,
    ingredientId,
    stock: Math.max(0, Math.round(nextStock * 1000) / 1000),
  })
}

export async function createKitchenIngredientFromProduct(params: {
  storeId: string
  productId: string
  productName: string
  unit?: KitchenIngredient['unit']
  stock: number
  lowStockThreshold: number
}): Promise<string> {
  const existing = await db.kitchenIngredients
    .where('productId')
    .equals(params.productId)
    .first()
  if (existing && !existing.archived) {
    throw new Error(`Le produit est déjà lié à l’ingrédient « ${existing.name} ».`)
  }

  const id = crypto.randomUUID()
  await db.kitchenIngredients.put({
    id,
    name: params.productName,
    unit: params.unit ?? 'piece',
    lowStockThreshold: params.lowStockThreshold,
    archived: false,
    productId: params.productId,
  })
  await db.kitchenIngredientStocks.put({
    id: kitchenIngredientStockRowId(params.storeId, id),
    storeId: params.storeId,
    ingredientId: id,
    stock: Math.max(0, params.stock),
  })
  return id
}
