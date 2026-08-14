'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

type Side = 'top' | 'right' | 'bottom' | 'left'

type TipPos = {
  top: number
  left: number
  transform: string
}

function positionFor(side: Side, rect: DOMRect): TipPos {
  switch (side) {
    case 'right':
      return {
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
        transform: 'translateY(-50%)',
      }
    case 'left':
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - 8,
        transform: 'translate(-100%, -50%)',
      }
    case 'bottom':
      return {
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)',
      }
    case 'top':
      return {
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
        transform: 'translate(-50%, -100%)',
      }
    default: {
      const _exhaustive: never = side
      return _exhaustive
    }
  }
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode
  children: ReactNode
  side?: Side
  className?: string
}) {
  const [pos, setPos] = useState<TipPos | null>(null)

  const show = useCallback(
    (el: HTMLElement) => {
      setPos(positionFor(side, el.getBoundingClientRect()))
    },
    [side],
  )

  const hide = useCallback(() => setPos(null), [])

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={hide}
    >
      {children}
      {pos && typeof document !== 'undefined'
        ? createPortal(
            <span
              role="tooltip"
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                transform: pos.transform,
                zIndex: 9999,
              }}
              className="pointer-events-none whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-md"
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
