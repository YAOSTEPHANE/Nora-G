import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'violet'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[color:var(--color-surface-sunken)] text-[color:var(--color-ink-muted)] border-[color:var(--color-border)]',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  accent: 'bg-caisse-gold-soft text-caisse-gold border-[rgba(0,51,170,0.22)]',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
}

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {dot ? (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current opacity-80"
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  )
}
