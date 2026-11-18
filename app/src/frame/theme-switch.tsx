import { cn } from '@/lib/utils'
import { LOOKS, useLook, type Look } from './theme'

const LABEL: Record<Look, string> = { device: 'Auto', light: 'Light', dark: 'Dark' }

/** Three small choices: follow the device, light, dark. */
export function ThemeSwitch() {
  const { look, setLook } = useLook()
  return (
    <div role="group" aria-label="Light or dark" className="inline-flex rounded-md border bg-card p-0.5">
      {LOOKS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={look === l}
          onClick={() => setLook(l)}
          className={cn(
            'min-h-9 rounded px-3 text-xs font-semibold text-muted-foreground',
            look === l && 'bg-secondary text-secondary-foreground',
          )}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  )
}
