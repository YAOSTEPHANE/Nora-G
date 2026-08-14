import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Affiche une table desktop et une liste de cards sur mobile.
 * Seuil : `md` (768px), aligné sur Catalogue / Journal / Tickets.
 */
export function ResponsiveData({
  table,
  cards,
  className,
  empty,
}: {
  /** Contenu table (souvent `<Table>…</Table>`). */
  table: ReactNode
  /** Liste de cards mobile (`<ul className="grid gap-2">…`). */
  cards: ReactNode
  className?: string
  /** Affiché à la place des deux layouts si fourni (EmptyState, etc.). */
  empty?: ReactNode | null
}) {
  if (empty) return <>{empty}</>
  return (
    <div className={cn('min-w-0', className)}>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{cards}</div>
    </div>
  )
}

/** Carte mobile standard pour listes métier. */
export function MobileDataCard({
  title,
  meta,
  body,
  actions,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  body?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <li
      className={cn(
        'rounded-2xl border border-[rgba(26,35,50,0.07)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(252,250,246,0.88))] p-3.5 shadow-[0_18px_40px_-28px_rgba(23,32,51,0.28)]',
        className,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{title}</div>
          {meta ? (
            <div className="mt-0.5 text-[11px] leading-snug text-ink-subtle">{meta}</div>
          ) : null}
        </div>
      </div>
      {body ? <div className="mt-2 text-[12px] text-ink-muted">{body}</div> : null}
      {actions ? (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-border/60 pt-2 sm:flex-row sm:flex-wrap">
          {actions}
        </div>
      ) : null}
    </li>
  )
}

/** Indique qu’une matrice table est scrollable horizontalement. */
export function TableScrollHint({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'mb-1.5 text-[11px] text-ink-subtle md:hidden',
        className,
      )}
    >
      Glisser horizontalement pour voir toutes les colonnes
    </p>
  )
}
