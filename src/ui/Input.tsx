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
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg:not([class*='text-'])]:text-ink-subtle">
            {iconLeft}
          </span>
        ) : null}
        <input
          ref={ref}
          className={cn(
            'ui-input',
            iconLeft ? 'ui-input--icon-left' : null,
            iconRight ? 'ui-input--icon-right' : null,
            invalid ? 'ui-input--invalid' : null,
            className,
          )}
          aria-invalid={invalid || undefined}
          {...rest}
        />
        {iconRight ? (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg:not([class*='text-'])]:text-ink-subtle">
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
        invalid && 'ui-input--invalid',
        className,
      )}
      aria-invalid={invalid || undefined}
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
        'ui-input min-h-18 resize-y py-2',
        invalid && 'ui-input--invalid',
        className,
      )}
      aria-invalid={invalid || undefined}
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
          'ui-input appearance-none pr-9',
          invalid && 'ui-input--invalid',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#0033aa]/65">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
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
}: {
  className?: string
  children: ReactNode
  required?: boolean
  /** @deprecated Preférez `hint` sur `Field` (sous le contrôle). */
  hint?: ReactNode
}) {
  return (
    <div className={cn('ui-field-label', className)}>
      <span className="ui-field-label-text">
        {children}
        {required ? <span className="ui-field-required">*</span> : null}
      </span>
    </div>
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
      {label ? <Label required={required}>{label}</Label> : null}
      {children}
      {error ? <p className="ui-field-error">{error}</p> : null}
      {!error && hint ? <p className="ui-field-hint">{hint}</p> : null}
    </div>
  )
}
