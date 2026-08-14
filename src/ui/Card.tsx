import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type DivProps = HTMLAttributes<HTMLDivElement>

export function Card({
  className,
  hover = false,
  ...rest
}: DivProps & { hover?: boolean }) {
  return (
    <div
      className={cn('ui-card', hover && 'ui-card-hover', className)}
      {...rest}
    />
  )
}

export function CardFlat({ className, ...rest }: DivProps) {
  return <div className={cn('ui-card-flat', className)} {...rest} />
}

export function CardHeader({
  className,
  title,
  subtitle,
  action,
  eyebrow,
  ...rest
}: DivProps & {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6',
        className,
      )}
      {...rest}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="ui-eyebrow mb-1.5">{eyebrow}</p> : null}
        {title ? <h3 className="ui-h2">{title}</h3> : null}
        {subtitle ? (
          <p className="ui-muted mt-1 text-sm leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardContent({ className, ...rest }: DivProps) {
  return <div className={cn('px-5 py-5 sm:px-6 sm:py-6', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: DivProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border/50 px-5 py-3.5 text-sm text-ink-subtle sm:px-6',
        className,
      )}
      {...rest}
    />
  )
}
