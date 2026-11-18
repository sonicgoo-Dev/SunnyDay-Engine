import { cn } from '@/lib/utils'

/** Sunny + italic Day, in Fraunces: the mark carried over from the first SunnyDay. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading font-light tracking-tight text-primary', className)}>
      Sunny<em className="text-sun italic">Day</em>
    </span>
  )
}
