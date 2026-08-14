import type { ReactNode } from 'react'
import { useRef } from 'react'
import { useHorizontalWheelScroll } from '../hooks/useHorizontalWheelScroll'
import { cn } from './cn'

export type TabItem<T extends string> = {
  id: T
  label: ReactNode
  count?: number
  icon?: ReactNode
}

type Props<T extends string> = {
  items: TabItem<T>[]
  active: T
  onChange: (id: T) => void
  className?: string
  variant?: 'underline' | 'segmented'
  /** Segmented : remplir la largeur (panier) ou défilement horizontal (défaut). */
  segmentedLayout?: 'scroll' | 'fill'
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  className,
  variant = 'underline',
  segmentedLayout = 'scroll',
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useHorizontalWheelScroll(scrollRef)

  if (variant === 'segmented') {
    const fill = segmentedLayout === 'fill'
    return (
      <div ref={scrollRef} className={cn(!fill && 'tabs-scroll-x', className)}>
        <div
          className={cn(
            'items-center gap-0.5 rounded-xl border border-[rgba(26,35,50,0.08)] bg-white/55 p-1 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]',
            fill ? 'flex w-full' : 'inline-flex min-w-max',
          )}
        >
        {items.map((it) => {
          const on = it.id === active
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onChange(it.id)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition',
                fill ? 'min-w-0 flex-1 px-2 py-1.5 text-[11px]' : 'gap-2 px-3 py-1.5 text-[12px]',
                on
                  ? 'bg-[linear-gradient(180deg,#f7f8fc,#e8eefa)] text-ink shadow-[0_8px_20px_-16px_rgba(0,51,170,0.45)]'
                  : 'text-ink-subtle hover:text-ink',
                '[&_svg]:h-3.5 [&_svg]:w-3.5',
              )}
            >
              {it.icon}
              {it.label}
              {typeof it.count === 'number' ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    on
                      ? 'bg-accent-soft text-accent-strong'
                      : 'bg-surface-sunken text-ink-subtle',
                  )}
                >
                  {it.count}
                </span>
              ) : null}
            </button>
          )
        })}
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className={cn('tabs-scroll-x', className)}>
      <div className="flex min-w-max items-center gap-0.5 border-b border-border">
      {items.map((it) => {
        const on = it.id === active
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={cn(
              'relative -mb-px inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold transition',
              on
                ? 'text-ink'
                : 'text-ink-subtle hover:text-ink-muted',
              '[&_svg]:h-3.5 [&_svg]:w-3.5',
            )}
          >
            {it.icon}
            {it.label}
            {typeof it.count === 'number' ? (
              <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-subtle">
                {it.count}
              </span>
            ) : null}
            {on ? (
              <span
                aria-hidden
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-caisse-gold"
              />
            ) : null}
          </button>
        )
      })}
      </div>
    </div>
  )
}
