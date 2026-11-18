// The one button. Semantic colours only; 44px tall by default so it is an
// easy tap on a phone.
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const VARIANTS = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-border bg-card text-foreground hover:bg-muted',
  quiet: 'text-muted-foreground hover:text-foreground hover:bg-muted',
  link: 'h-auto min-h-0 px-0 text-primary underline underline-offset-2 hover:opacity-80',
} as const

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }

export function Button({ variant = 'primary', className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}
