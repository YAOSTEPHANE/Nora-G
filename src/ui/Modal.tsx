import { useEffect, type ReactNode } from 'react'
import { IconClose } from './icons'
import { IconButton } from './Button'
import { cn } from './cn'

type Props = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Désactive la fermeture sur clic backdrop. */
  staticBackdrop?: boolean
  /** `page` : s’ouvre dans la vue courante, sans overlay. */
  variant?: 'overlay' | 'page'
}

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  staticBackdrop = false,
  variant = 'overlay',
}: Props) {
  const isPage = variant === 'page'

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    if (isPage) {
      return () => window.removeEventListener('keydown', handler)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [open, onClose, isPage])

  if (!open) return null

  const chrome = (
    <>
      {(title || subtitle) ? (
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,51,170,0.08)] bg-caisse-ivory px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            {title ? (
              <h2 className="ui-h2 truncate text-[15px] sm:text-base">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="ui-muted mt-0.5 text-[12px] leading-snug">{subtitle}</p>
            ) : null}
          </div>
          <IconButton size="sm" onClick={onClose} aria-label="Fermer">
            <IconClose />
          </IconButton>
        </div>
      ) : (
        <div className="absolute right-3 top-3 z-10">
          <IconButton size="sm" onClick={onClose} aria-label="Fermer">
            <IconClose />
          </IconButton>
        </div>
      )}
      <div
        className={cn(
          'ui-scroll ui-form min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5',
          isPage && 'overflow-visible',
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgba(0,51,170,0.08)] bg-caisse-ivory px-4 py-3 sm:px-5">
          {footer}
        </div>
      ) : null}
    </>
  )

  if (isPage) {
    return (
      <div
        className="ui-form-page relative flex w-full flex-col overflow-hidden"
        role="region"
      >
        {chrome}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 animate-ui-fade-in bg-zinc-950/40 backdrop-blur-[2px]"
        onClick={() => {
          if (!staticBackdrop) onClose()
        }}
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[calc(100svh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-[rgba(0,51,170,0.12)] bg-white shadow-[var(--shadow-overlay)] animate-ui-scale-in',
          SIZE[size],
        )}
      >
        {chrome}
      </div>
    </div>
  )
}
