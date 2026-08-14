import { forwardRef, useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../ui/cn'
import { IconCaisse, IconPlus, IconScan, IconSearch } from '../ui/icons'

type Props = {
  sessionId: string
  activeStoreLabel: string
  barcode: string
  onBarcodeChange: (v: string) => void
  onBarcodeSubmit: () => void
  search: string
  onSearchChange: (v: string) => void
  onAddProduct?: () => void
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export const CaisseHeader = forwardRef<HTMLInputElement, Props>(
  function CaisseHeader(
    {
      sessionId,
      activeStoreLabel,
      barcode,
      onBarcodeChange,
      onBarcodeSubmit,
      search,
      onSearchChange,
      onAddProduct,
    },
    ref,
  ) {
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
      const t = setInterval(() => setNow(new Date()), 1000)
      return () => clearInterval(t)
    }, [])

    return (
      <header className="caisse-header mb-4 p-4 sm:mb-5 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="caisse-session-chip">
                Session · {sessionId.slice(0, 8).toUpperCase()}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-caisse-gold">
                {activeStoreLabel}
              </span>
            </p>
            <h2 className="mt-2 flex items-center gap-2.5 font-display text-[1.55rem] font-semibold tracking-tight text-caisse-ink sm:text-[1.75rem]">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(0,51,170,0.22)] bg-[linear-gradient(145deg,#f7f8fc,#e8eefa)] text-caisse-gold shadow-[var(--shadow-caisse-card)]">
                <IconCaisse className="h-5 w-5" />
              </span>
              Caisse
            </h2>
            <p className="mt-1 hidden capitalize text-[12px] text-caisse-muted sm:block">
              {formatDate(now)}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <div className="caisse-clock-card">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-caisse-gold">
                Heure
              </p>
              <p className="caisse-clock font-mono-nums">{formatTime(now)}</p>
            </div>
            {onAddProduct ? (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<IconPlus className="text-caisse-gold" />}
                onClick={onAddProduct}
                className="shrink-0 border-[rgba(0,51,170,0.28)] bg-white/90 hover:border-[rgba(0,51,170,0.45)] hover:bg-[#f7f8fc]"
              >
                Nouveau produit
              </Button>
            ) : null}
          </div>
        </div>

        <div className="caisse-search-bar mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          <Input
            ref={ref}
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            data-barcode-input
            value={barcode}
            onChange={(e) => onBarcodeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onBarcodeSubmit()
              }
            }}
            placeholder="Douchette — scannez ici"
            aria-label="Lecteur code-barres"
            className={cn('font-mono-nums caisse-input-luxe')}
            iconLeft={<IconScan className="text-caisse-gold" />}
            autoComplete="off"
            spellCheck={false}
          />
          <Input
            type="search"
            data-product-search
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher un article…"
            aria-label="Recherche textuelle"
            className="caisse-input-luxe"
            iconLeft={<IconSearch className="text-caisse-muted" />}
            autoComplete="off"
          />
        </div>
      </header>
    )
  },
)
