import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
  description?: string
}

function ToggleTrack({
  checked,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  checked?: boolean
}) {
  return (
    <span className={cn('relative inline-flex h-5 w-9 shrink-0 items-center', className)}>
      <input type="checkbox" checked={checked} className="peer sr-only" {...rest} />
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-[#d8deea] transition peer-checked:bg-[#0033aa] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0033aa]/35"
      />
      <span
        aria-hidden
        className="absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4"
      />
    </span>
  )
}

export function Switch({
  label,
  description,
  className,
  checked,
  ...rest
}: Props) {
  if (!label && !description) {
    return (
      <span className={cn('inline-flex cursor-pointer items-center', className)}>
        <ToggleTrack checked={checked} {...rest} />
      </span>
    )
  }

  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-3', className)}>
      <ToggleTrack checked={checked} {...rest} />
      <span className="flex flex-col">
        {label ? (
          <span className="text-[12px] font-medium text-ink">{label}</span>
        ) : null}
        {description ? (
          <span className="text-[11px] text-ink-subtle">{description}</span>
        ) : null}
      </span>
    </label>
  )
}
