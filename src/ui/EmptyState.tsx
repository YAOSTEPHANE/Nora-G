import type { ReactNode } from 'react'
import { cn } from './cn'
import { IconSparkles } from './icons'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = 'card',
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  variant?: 'card' | 'flat'
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        variant === 'card' &&
          'rounded-2xl border border-dashed border-[rgba(0,51,170,0.22)] bg-[linear-gradient(180deg,rgba(247,248,252,0.9),rgba(238,241,248,0.7))] shadow-[0_18px_40px_-28px_rgba(23,32,51,0.22)]',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(0,51,170,0.2)] bg-caisse-gold-soft text-caisse-gold [&_svg]:h-5 [&_svg]:w-5">
        {icon ?? <IconSparkles />}
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description ? (
          <p className="text-[13px] leading-relaxed text-ink-subtle">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
