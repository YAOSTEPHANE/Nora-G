import { db } from '../db/db'
import type { CustomerCreditEntry, LoyaltyCustomer } from '../db/types'

export function customerCreditBalance(c: LoyaltyCustomer): number {
  return Math.max(0, Math.round(c.creditBalanceTTC ?? 0))
}

export function customerCreditLimit(c: LoyaltyCustomer): number {
  return Math.max(0, Math.round(c.creditLimitTTC ?? 0))
}

export function customerCreditAvailable(c: LoyaltyCustomer): number {
  return Math.max(0, customerCreditLimit(c) - customerCreditBalance(c))
}

export async function applyCustomerCreditSale(params: {
  customerId: string
  amountTTC: number
  saleId: string
  storeId?: string
  actor?: { profileId: string; displayName: string }
}): Promise<void> {
  const amount = Math.round(params.amountTTC)
  if (amount <= 0) return
  const customer = await db.loyaltyCustomers.get(params.customerId)
  if (!customer) throw new Error('Client introuvable pour le crédit.')
  const limit = customerCreditLimit(customer)
  const balance = customerCreditBalance(customer)
  if (limit > 0 && balance + amount > limit + 1) {
    throw new Error(
      `Plafond crédit dépassé (disponible ${Math.max(0, limit - balance)} FCFA).`,
    )
  }
  const nextBalance = balance + amount
  await db.loyaltyCustomers.update(params.customerId, {
    creditBalanceTTC: nextBalance,
    updatedAt: Date.now(),
  })
  const entry: CustomerCreditEntry = {
    id: crypto.randomUUID(),
    customerId: params.customerId,
    createdAt: Date.now(),
    type: 'sale',
    amountTTC: amount,
    balanceAfterTTC: nextBalance,
    saleId: params.saleId,
    note: 'Vente à crédit',
    actorProfileId: params.actor?.profileId,
    actorDisplayName: params.actor?.displayName,
    storeId: params.storeId,
  }
  await db.customerCreditEntries.add(entry)
}

export async function recordCustomerCreditPayment(params: {
  customerId: string
  amountTTC: number
  note?: string
  actor?: { profileId: string; displayName: string }
  storeId?: string
}): Promise<void> {
  const amount = Math.round(params.amountTTC)
  if (amount <= 0) throw new Error('Montant invalide.')
  const customer = await db.loyaltyCustomers.get(params.customerId)
  if (!customer) throw new Error('Client introuvable.')
  const balance = customerCreditBalance(customer)
  const pay = Math.min(amount, balance)
  const nextBalance = balance - pay
  await db.loyaltyCustomers.update(params.customerId, {
    creditBalanceTTC: nextBalance,
    updatedAt: Date.now(),
  })
  await db.customerCreditEntries.add({
    id: crypto.randomUUID(),
    customerId: params.customerId,
    createdAt: Date.now(),
    type: 'payment',
    amountTTC: -pay,
    balanceAfterTTC: nextBalance,
    note: params.note?.trim() || 'Règlement encours',
    actorProfileId: params.actor?.profileId,
    actorDisplayName: params.actor?.displayName,
    storeId: params.storeId,
  })
}

export async function setCustomerCreditLimit(
  customerId: string,
  limitTTC: number,
): Promise<void> {
  const limit = Math.max(0, Math.round(limitTTC))
  await db.loyaltyCustomers.update(customerId, {
    creditLimitTTC: limit,
    updatedAt: Date.now(),
  })
}
