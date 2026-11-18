// A labelled text box. Real label, 44px tall, 16px text so a phone does not zoom in.
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; id: string }

export function Field({ label, hint, id, className, ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          'min-h-11 w-full rounded-md border border-border bg-card px-3 text-base text-foreground',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60',
          className,
        )}
        {...rest}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
