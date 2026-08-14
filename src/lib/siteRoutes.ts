/**
 * Helpers de routes + hook useSitePath (contexte).
 * Le Provider Next (usePathname/useRouter) vit dans apps/web/app/SitePathProvider.tsx
 */

export {
  SitePathContext,
  useSitePath,
  type SitePathContextValue,
} from './sitePathContext'

export const ROUTES = {
  home: '/',
  pricing: '/tarifs',
  signup: '/inscription',
  login: '/connexion',
  staff: '/staff',
  subscription: '/abonnement',
  storefrontBase: '/boutique',
} as const

export function signupUrl(_plan?: string): string {
  return ROUTES.signup
}

export function isSignupPath(pathname: string): boolean {
  const p = pathname.toLowerCase()
  return p.startsWith('/inscription') || p.startsWith(ROUTES.login)
}

export function isOwnerAuthPath(pathname: string): boolean {
  const p = pathname.toLowerCase()
  return p.startsWith('/inscription') || p.startsWith(ROUTES.login)
}

export function isSubscriptionPath(pathname: string): boolean {
  return pathname.toLowerCase().startsWith(ROUTES.subscription)
}

export function parseStorefrontCode(pathname: string): string | null {
  const prefix = `${ROUTES.storefrontBase}/`
  if (!pathname.toLowerCase().startsWith(prefix.toLowerCase())) return null
  const segment = pathname.slice(prefix.length).split('/')[0]?.trim()
  if (!segment) return null
  return decodeURIComponent(segment)
}

/**
 * Chemin boutique public.
 * - slug entreprise (ex. restaurant-le-palmier) : conservé en minuscules
 * - code MAG-XXXX (legacy) : normalisé en majuscules
 */
export function storefrontPath(slugOrCode: string): string {
  const raw = slugOrCode.trim()
  if (!raw) return ROUTES.storefrontBase
  if (/^MAG-?[A-Z0-9]+$/i.test(raw.replace(/\s/g, ''))) {
    const code = raw.replace(/\s/g, '').toUpperCase().replace(/^MAG(?!-)/, 'MAG-')
    return `${ROUTES.storefrontBase}/${encodeURIComponent(code)}`
  }
  return `${ROUTES.storefrontBase}/${encodeURIComponent(raw.toLowerCase())}`
}

export function storefrontUrl(slugOrCode: string, origin?: string): string {
  const base =
    origin ??
    (typeof globalThis.window !== 'undefined' ? globalThis.window.location.origin : '')
  return `${base.replace(/\/$/, '')}${storefrontPath(slugOrCode)}`
}

export function isStaffPath(pathname?: string): boolean {
  if (typeof window === 'undefined' && !pathname) return false
  const path = (pathname ?? window.location.pathname).toLowerCase()
  const search =
    typeof window !== 'undefined' ? window.location.search.toLowerCase() : ''
  const hash =
    typeof window !== 'undefined' ? window.location.hash.toLowerCase() : ''
  return (
    path.endsWith('/staff') ||
    path.includes('/staff/') ||
    search.includes('staff') ||
    hash.includes('staff')
  )
}
