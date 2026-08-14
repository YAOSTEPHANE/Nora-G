import type { Request } from 'express'

/** URL publique de l’app (retours paiement boutique, liens absolus). */
export function publicAppUrl(req?: {
  get: (name: string) => string | undefined
}): string {
  const fromEnv = process.env.APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (req) {
    const proto = req.get('x-forwarded-proto') ?? 'http'
    const host = req.get('x-forwarded-host') ?? req.get('host')
    if (host) return `${proto}://${host}`.replace(/\/$/, '')
  }
  return 'http://localhost:3000'
}

/** @deprecated Abonnements retirés — conservé pour compatibilité éventuelle. */
export function subscriptionSuccessUrl(baseUrl: string, _tx?: string): string {
  return `${baseUrl.replace(/\/$/, '')}/staff`
}

/** @deprecated Abonnements retirés — conservé pour compatibilité éventuelle. */
export function subscriptionCancelUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/staff`
}
