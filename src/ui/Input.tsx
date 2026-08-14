import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { forwardRef } from 'react'
import { cn } from './cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  iconLeft?: ReactNode
  iconRight?: ReactNode
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, iconLeft, iconRight, invalid, ...rest },
  ref,
) {
  if (iconLeft || iconRight) {
    return (
      <div className="relative">
        {iconLeft ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 [&_svg]:h-4 [&_svg]:w-4 [&_svg:not([class*='text-'])]:text-ink-subtle">
            {iconLeft}
          </span>
        ) : null}
        <input
          ref={ref}
          className={cn(
            'ui-input',
            iconLeft ? 'ui-input--icon-left' : null,
            iconRight ? 'ui-input--icon-right' : null,
            invalid ? 'border-rose-400 focus:border-rose-500' : null,
            className,
          )}
          {...rest}
        />
        {iconRight ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 [&_svg]:h-4 [&_svg]:w-4 [&_svg:not([class*='text-'])]:text-ink-subtle">
            {iconRight}
          </span>
        ) : null}
      </div>
    )
  }
  return (
    <input
      ref={ref}
      className={cn(
        'ui-input',
        invalid && 'border-rose-400 focus:border-rose-500',
        className,
      )}
      {...rest}
    />
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'ui-input min-h-[88px] resize-y',
        invalid && 'border-rose-400 focus:border-rose-500',
        className,
      )}
      {...rest}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, children, invalid, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'ui-input appearance-none pr-10',
          invalid && 'border-rose-400 focus:border-rose-500',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#0033aa]/70">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  )
})

export function Label({
  className,
  children,
  required,
  hint,
}: {
  className?: string
  children: ReactNode
  required?: boolean
  hint?: ReactNode
}) {
  return (
    <label
      className={cn(
        'mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle',
        className,
      )}
    >
      <span>
        {children}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
      </span>
      {hint ? (
        <span className="text-[11px] font-normal text-ink-subtle">{hint}</span>
      ) : null}
    </label>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('ui-field block', className)}>
      {label ? (
        <Label required={required} hint={hint}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-[11px] font-medium text-rose-600">{error}</p>
      ) : null}
    </div>
  )
}
