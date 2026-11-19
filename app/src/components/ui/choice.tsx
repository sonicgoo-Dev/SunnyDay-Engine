// A labelled drop-down, a labelled text area and a tick box, matching Field:
// real labels, 44px tall, 16px text so a phone does not zoom in.
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const box = 'w-full rounded-md border border-border bg-card px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string; hint?: ReactNode; hideLabel?: boolean }

export function Select({ label, id, hint, hideLabel = false, className, children, ...rest }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-semibold'}>
        {label}
      </label>
      <select id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={cn(box, 'min-h-11', className)} {...rest}>
        {children}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string; hint?: ReactNode; hideLabel?: boolean }

export function TextArea({ label, id, hint, hideLabel = false, className, ...rest }: AreaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-semibold'}>
        {label}
      </label>
      <textarea id={id} rows={4} aria-describedby={hint ? `${id}-hint` : undefined} className={cn(box, 'py-2', className)} {...rest} />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; id: string }

export function Check({ label, id, className, ...rest }: CheckProps) {
  return (
    <label htmlFor={id} className={cn('flex min-h-11 cursor-pointer items-center gap-3 text-base', className)}>
      <input id={id} type="checkbox" className="size-5 accent-primary" {...rest} />
      {label}
    </label>
  )
}

/** A short, honest message: good news in the calm colour, a problem in amber. */
export function Notice({ good = false, children }: { good?: boolean; children: ReactNode }) {
  return (
    <p role="status" className={good ? 'rounded-md bg-secondary px-4 py-3 text-sm text-secondary-foreground' : 'rounded-md bg-warning px-4 py-3 text-sm text-warning-foreground'}>
      {children}
    </p>
  )
}
