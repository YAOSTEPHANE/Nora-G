import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string
  description?: string
}

export function Switch({
  label,
  description,
  className,
  checked,
  ...rest
}: Props) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-3',
        className,
      )}
    >
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          className="peer sr-only"
          {...rest}
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[#d8deea] transition peer-checked:bg-[#0033aa]"
        />
        <span
          aria-hidden
          className="absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4"
        />
      </span>
      {label || description ? (
        <span className="flex flex-col">
          {label ? (
            <span className="text-[13px] font-medium text-zinc-800">
              {label}
            </span>
          ) : null}
          {description ? (
            <span className="text-[11px] text-zinc-500">{description}</span>
          ) : null}
        </span>
      ) : null}
    </label>
  )
}
