import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'
import { cn } from './cn'

type Density = 'comfortable' | 'compact'

/**
 * Table avec scroll X local.
 * Pour le mobile, préférer `ResponsiveData` (table desktop + cards).
 * Utiliser `hideBelow` / `sticky` sur `Th`/`Td` pour les matrices larges.
 */
export function Table({
  className,
  children,
  density = 'comfortable',
  minWidth,
}: {
  className?: string
  children: ReactNode
  /** `compact` réduit légèrement le padding (utile pour mobile / vues denses). */
  density?: Density
  /** Force une largeur min en pixels (active scroll horizontal sous ce seuil). */
  minWidth?: number
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-2xl border border-[rgba(26,35,50,0.07)] bg-white/80 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_40px_-28px_rgba(23,32,51,0.28)] backdrop-blur-xl',
        className,
      )}
      data-density={density}
    >
      <div className="ui-scroll relative -mx-px overflow-x-auto overscroll-x-contain">
        <table
          className="w-full text-left text-sm"
          style={minWidth ? { minWidth } : undefined}
        >
          {children}
        </table>
      </div>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(238,241,248,0.9),rgba(246,248,252,0.72))] text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
      {children}
    </thead>
  )
}

export function TBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <tbody className={cn('divide-y divide-border/50', className)}>
      {children}
    </tbody>
  )
}

export function Tr({
  className,
  children,
  hover = true,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { hover?: boolean }) {
  return (
    <tr
      className={cn(
        hover && 'transition-colors duration-150 hover:bg-caisse-gold-soft/40',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  )
}

type ColResponsive = {
  /** Cache la colonne en dessous de la breakpoint indiquée. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  /** Rend la colonne sticky à gauche (pratique pour la 1ère colonne d'une matrice). */
  sticky?: boolean
}

const HIDE_CLS: Record<NonNullable<ColResponsive['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

export function Th({
  className,
  align = 'left',
  hideBelow,
  sticky,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> &
  ColResponsive & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cn(
        'px-3 py-3 font-semibold tracking-wide sm:px-4',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        sticky &&
          'sticky left-0 z-10 bg-surface-sunken/95 backdrop-blur-sm',
        hideBelow && HIDE_CLS[hideBelow],
        className,
      )}
      {...rest}
    />
  )
}

export function Td({
  className,
  align = 'left',
  mono = false,
  hideBelow,
  sticky,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> &
  ColResponsive & {
    align?: 'left' | 'right' | 'center'
    mono?: boolean
  }) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 text-[13px] leading-snug text-ink-muted sm:px-4 sm:py-3.5',
        mono && 'font-mono-nums',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        sticky && 'sticky left-0 z-10 bg-white',
        hideBelow && HIDE_CLS[hideBelow],
        className,
      )}
      {...rest}
    />
  )
}
