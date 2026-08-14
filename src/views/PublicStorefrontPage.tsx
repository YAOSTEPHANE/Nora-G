import { useEffect, useMemo, useState } from 'react'
import { OfflineBanner } from '../components/OfflineBanner'
import {
  fetchStorefrontInfo,
  fetchStorefrontMenu,
  submitPublicStorefrontOrder,
  verifyStorefrontOrderPayment,
} from '../lib/storefront/api'
import type { ProductWithStock, Promotion } from '../db/types'
import type {
  PublicStorefrontOrderInput,
  StorefrontBranding,
} from '../lib/storefront/types'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { LuxuryStorefrontView } from './LuxuryStorefrontView'

type Props = {
  storeCode: string
  online: boolean
}

function readPaymentReturn(): {
  orderId: string
  outcome: 'success' | 'cancel'
} | null {
  const params = new URLSearchParams(globalThis.location.search)
  const orderId = params.get('order')?.trim()
  const payment = params.get('payment')?.trim()
  if (!orderId) return null
  if (payment === 'success') return { orderId, outcome: 'success' }
  if (payment === 'cancel') return { orderId, outcome: 'cancel' }
  return null
}

function clearPaymentQueryFromUrl() {
  const url = new URL(globalThis.location.href)
  url.searchParams.delete('order')
  url.searchParams.delete('payment')
  const next = `${url.pathname}${url.search}${url.hash}`
  globalThis.history.replaceState({}, '', next)
}

export function PublicStorefrontPage({ storeCode, online }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [storeName, setStoreName] = useState('')
  const [products, setProducts] = useState<ProductWithStock[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [storeId, setStoreId] = useState('store-main')
  const [usable, setUsable] = useState(true)
  const [waveEnabled, setWaveEnabled] = useState(false)
  const [branding, setBranding] = useState<StorefrontBranding | undefined>()
  const [categories, setCategories] = useState<string[]>([])
  const [paymentBanner, setPaymentBanner] = useState<{
    tone: 'success' | 'error'
    message: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const info = await fetchStorefrontInfo(storeCode)
        if (!cancelled) {
          setWaveEnabled(info.waveEnabled)
        }
        if (!info.usable) {
          if (!cancelled) {
            setUsable(false)
            setStoreName(info.name)
            setLoading(false)
          }
          return
        }
        const menu = await fetchStorefrontMenu(storeCode)
        if (cancelled) return
        setStoreName(menu.storeName || menu.name)
        setStoreId(menu.storeId)
        setProducts(menu.products)
        setPromotions(menu.promotions ?? [])
        setBranding(menu.branding)
        setCategories(menu.categories ?? [])
        setUsable(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Boutique indisponible.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storeCode])

  useEffect(() => {
    const paymentReturn = readPaymentReturn()
    if (!paymentReturn) return

    clearPaymentQueryFromUrl()

    if (paymentReturn.outcome === 'cancel') {
      setPaymentBanner({
        tone: 'error',
        message:
          'Paiement Wave annulé. Votre commande n’a pas été validée — vous pouvez réessayer.',
      })
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const result = await verifyStorefrontOrderPayment(
          storeCode,
          paymentReturn.orderId,
        )
        if (cancelled) return
        const ref = paymentReturn.orderId.slice(0, 8).toUpperCase()
        if (result.status === 'paid' || result.status === 'pending') {
          setPaymentBanner({
            tone: 'success',
            message: `Paiement Wave confirmé. Commande ${ref} envoyée au commerçant.`,
          })
        } else if (result.status === 'failed') {
          setPaymentBanner({
            tone: 'error',
            message: `Paiement refusé pour la commande ${ref}. Contactez la boutique si besoin.`,
          })
        } else {
          setPaymentBanner({
            tone: 'success',
            message: `Retour Wave enregistré (réf. ${ref}). Le commerçant confirmera sous peu.`,
          })
        }
      } catch {
        if (!cancelled) {
          setPaymentBanner({
            tone: 'error',
            message:
              'Impossible de vérifier le paiement Wave. Contactez la boutique avec votre référence.',
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [storeCode])

  const publicStorefront = useMemo(
    () => ({
      storeName,
      storeId,
      products,
      promotions,
      categories,
      waveEnabled,
      branding,
      submitOrder: async (order: PublicStorefrontOrderInput) => {
        const result = await submitPublicStorefrontOrder(storeCode, order)
        return result
      },
    }),
    [
      storeCode,
      storeId,
      storeName,
      products,
      promotions,
      categories,
      waveEnabled,
      branding,
    ],
  )

  if (loading) {
    return (
      <div className="storefront-shell flex min-h-svh items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-stone-300"
          style={{ borderTopColor: 'var(--storefront-accent, #0033aa)' }}
        />
      </div>
    )
  }

  if (!usable) {
    return (
      <div className="storefront-shell flex min-h-svh items-center justify-center px-4">
        <Card className="max-w-md border-stone-200 bg-white shadow-sm">
          <CardContent className="space-y-3 p-8 text-center">
            <h1 className="text-xl font-bold text-stone-900">{storeName}</h1>
            <p className="text-sm text-stone-600">
              Cette boutique n’accepte pas de commandes en ligne pour le moment.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || products.length === 0) {
    return (
      <div className="storefront-shell flex min-h-svh flex-col">
        {!online ? <OfflineBanner /> : null}
        <div className="flex flex-1 items-center justify-center px-4">
          <Card className="max-w-lg border-stone-200 bg-white shadow-sm">
            <CardContent className="space-y-4 p-8 text-center">
              <h1 className="text-xl font-bold text-stone-900">Boutique en ligne</h1>
              <p className="text-sm leading-relaxed text-stone-600">
                {error ??
                  'Le menu n’a pas encore été publié. Le commerçant doit publier son catalogue depuis l’espace Abonnement.'}
              </p>
              <Button type="button" variant="secondary" onClick={() => globalThis.history.back()}>
                Retour
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <>
      {paymentBanner ? (
        <div
          className={`fixed inset-x-0 top-0 z-50 border-b px-4 py-3 text-center text-sm ${
            paymentBanner.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
          role="status"
        >
          {paymentBanner.message}
          <button
            type="button"
            className="ml-3 underline opacity-80 hover:opacity-100"
            onClick={() => setPaymentBanner(null)}
          >
            Fermer
          </button>
        </div>
      ) : null}
      <LuxuryStorefrontView
        online={online}
        seedReady
        onOpenStaffLogin={() => {}}
        publicStorefront={publicStorefront}
      />
    </>
  )
}
