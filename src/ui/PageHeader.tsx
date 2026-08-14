import type { ReactNode } from 'react'
import { cn } from './cn'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('module-hero', className)}>
      <div className="relative flex flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon ? (
            <span className="module-hero-icon hidden sm:flex">{icon}</span>
          ) : (
            <span className="module-hero-mark hidden sm:block" aria-hidden />
          )}
          <div className="min-w-0">
            {eyebrow ? <p className="ui-eyebrow mb-1.5">{eyebrow}</p> : null}
            <h1 className="ui-h1 text-[1.55rem] leading-tight sm:text-2xl lg:text-[1.8rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="ui-muted mt-1.5 max-w-2xl text-[13px] leading-relaxed sm:text-sm">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex max-w-full flex-wrap items-center gap-2 sm:gap-2.5 lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-end justify-between gap-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="ui-h2">{title}</h2>
        {subtitle ? (
          <p className="ui-muted mt-1 text-[13px] leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      ) : null}
    </div>
  )
}
