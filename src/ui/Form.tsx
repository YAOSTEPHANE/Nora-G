import type { ReactNode } from 'react'
import { Card, CardContent } from './Card'
import { cn } from './cn'

export function FormPanel({
  eyebrow,
  title,
  description,
  children,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('ui-form-panel', className)}>
      {eyebrow || title || description ? (
        <div className="ui-form-panel-head">
          {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
          {title ? <h3 className="ui-form-panel-title">{title}</h3> : null}
          {description ? (
            <p className="ui-muted mt-1 max-w-2xl text-[12px] leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <CardContent className="ui-form-panel-body ui-form">{children}</CardContent>
      {actions ? <div className="ui-form-panel-foot">{actions}</div> : null}
    </Card>
  )
}

export function FormSection({
  title,
  description,
  children,
  columns = 2,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  columns?: 1 | 2 | 3
  className?: string
}) {
  return (
    <section className={cn('ui-form-section', className)}>
      {title ? (
        <header className="ui-form-section-head">
          <h4>{title}</h4>
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      <div
        className={cn(
          'ui-form-grid',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {children}
      </div>
    </section>
  )
}

export function FormGrid({
  columns = 2,
  className,
  children,
}: {
  columns?: 1 | 2 | 3 | 4
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'ui-form-grid',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function FormChip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('ui-form-chip', active && 'is-on')}
    >
      {children}
    </button>
  )
}

export function FormSwitchRow({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="ui-form-switch-row">
      {hint ? (
        <span className="ui-form-switch-row-text">
          <span>{label}</span>
          <span>{hint}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
      {children}
    </div>
  )
}

/** Bannière d’erreur globale en bas / haut d’un formulaire. */
export function FormAlert({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  if (!children) return null
  return (
    <div role="alert" className={cn('ui-form-alert', className)}>
      <span>{children}</span>
    </div>
  )
}

export function FormActions({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('ui-form-actions', className)}>{children}</div>
}
