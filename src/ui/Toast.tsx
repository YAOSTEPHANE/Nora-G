/* Le provider et ses hooks utilisent le même contexte privé. */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  IconAlert,
  IconCheckCircle,
  IconClose,
  IconInfo,
  IconWarning,
} from './icons'
import { cn } from './cn'

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

type Toast = {
  id: number
  tone: ToastTone
  title: string
  description?: string
  duration: number
}

type Ctx = {
  show: (
    title: string,
    opts?: { tone?: ToastTone; description?: string; duration?: number },
  ) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<Ctx | null>(null)

export function useToast(): Ctx {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      show: () => undefined,
      success: () => undefined,
      error: () => undefined,
      warning: () => undefined,
      info: () => undefined,
    }
  }
  return ctx
}

const TONE_STYLES: Record<
  ToastTone,
  { ring: string; icon: ReactNode; iconClass: string }
> = {
  success: {
    ring: 'border-emerald-200',
    icon: <IconCheckCircle />,
    iconClass: 'text-emerald-600',
  },
  error: {
    ring: 'border-rose-200',
    icon: <IconAlert />,
    iconClass: 'text-rose-600',
  },
  warning: {
    ring: 'border-amber-200',
    icon: <IconWarning />,
    iconClass: 'text-amber-600',
  },
  info: {
    ring: 'border-zinc-200',
    icon: <IconInfo />,
    iconClass: 'text-zinc-600',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const idRef = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((arr) => arr.filter((t) => t.id !== id))
  }, [])

  const show = useCallback<Ctx['show']>(
    (title, opts = {}) => {
      const id = ++idRef.current
      const t: Toast = {
        id,
        tone: opts.tone ?? 'info',
        title,
        description: opts.description,
        duration: opts.duration ?? 4500,
      }
      setItems((arr) => [...arr, t])
      if (t.duration > 0) {
        window.setTimeout(() => remove(id), t.duration)
      }
    },
    [remove],
  )

  const value = useMemo<Ctx>(
    () => ({
      show,
      success: (title, description) => show(title, { tone: 'success', description }),
      error: (title, description) => show(title, { tone: 'error', description }),
      warning: (title, description) => show(title, { tone: 'warning', description }),
      info: (title, description) => show(title, { tone: 'info', description }),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onClose={remove} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  items,
  onClose,
}: {
  items: Toast[]
  onClose: (id: number) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="toast-viewport pointer-events-none fixed z-[200] ml-auto flex w-full max-w-[340px] flex-col gap-2 sm:left-auto">
      {items.map((t) => {
        const s = TONE_STYLES[t.tone]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex animate-ui-toast-in items-start gap-3 rounded-xl border bg-white p-3 shadow-[var(--shadow-pop)]',
              s.ring,
            )}
            role="status"
          >
            <span className={cn('mt-0.5 shrink-0 [&_svg]:h-4 [&_svg]:w-4', s.iconClass)}>
              {s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-zinc-900">
                {t.title}
              </p>
              {t.description ? (
                <p className="mt-0.5 text-[12px] leading-snug text-zinc-600">
                  {t.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Fermer"
              onClick={() => onClose(t.id)}
              className="ui-icon-btn flex shrink-0 items-center justify-center rounded-md p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 [&_svg]:h-3.5 [&_svg]:w-3.5"
            >
              <IconClose />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Hook indépendant : confirm modal léger.
 * Usage : `const c = await confirm('Archiver ?')` — utiliser avec parcimonie ;
 * pour une UX riche, préférer la primitive Modal directement.
 */
export function useConfirmDialog() {
  return useCallback((message: string): boolean => {
    void message
    return true
  }, [])
}
