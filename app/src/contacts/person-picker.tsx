// Pick someone already in Contacts by typing part of any detail about them.
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { findContacts } from './contacts.functions'

type Person = { id: string; fullName: string }

export function PersonPicker({ id, label, except, onPick, hint }: { id: string; label: string; except?: string; onPick: (p: Person) => void; hint?: string }) {
  const find = useServerFn(findContacts)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Person[] | null>(null)
  useEffect(() => {
    if (q.trim().length < 2) return setFound(null)
    let live = true
    const t = setTimeout(async () => {
      const people = await find({ data: { q: q.trim(), ...(except ? { except } : {}) } })
      if (live) setFound(people)
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q])
  return (
    <div className="flex flex-col gap-2">
      <Field id={id} label={label} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type part of their name" autoComplete="off" {...(hint ? { hint } : {})} />
      {found && found.length === 0 && <p className="text-sm text-muted-foreground">Nobody in your contacts matches that.</p>}
      {found && found.length > 0 && (
        <ul className="flex flex-col gap-1">
          {found.map((p) => (
            <li key={p.id}>
              <Button variant="outline" className="w-full justify-start" onClick={() => onPick(p)}>
                {p.fullName}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
