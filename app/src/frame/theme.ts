// Light and dark. Follows the device until the person picks one with the
// switch at the foot of the menu; the choice is kept on that device only
// (its browser storage), never on the server.
import { useCallback, useEffect, useState } from 'react'

export const LOOKS = ['device', 'light', 'dark'] as const
export type Look = (typeof LOOKS)[number]

const KEY = 'sunnyday-look'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readLook(): Look {
  try {
    const v = localStorage.getItem(KEY)
    return (LOOKS as readonly string[]).includes(v ?? '') ? (v as Look) : 'device'
  } catch {
    return 'device'
  }
}

function apply(look: Look) {
  const dark = look === 'dark' || (look === 'device' && matchMedia(DARK_QUERY).matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

/** Runs in the page's head before anything is drawn, so a dark device never sees a flash of white. */
export const LOOK_BEFORE_PAINT = `(function(){try{var v=localStorage.getItem('${KEY}');var d=v==='dark'||(v!=='light'&&matchMedia('${DARK_QUERY}').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`

/** The current choice and a way to change it. Null until the page knows (the server cannot). */
export function useLook() {
  const [look, setLookState] = useState<Look | null>(null)

  useEffect(() => {
    setLookState(readLook())
  }, [])

  // While following the device, follow it live.
  useEffect(() => {
    if (look !== 'device') return
    const mql = matchMedia(DARK_QUERY)
    const onChange = () => apply('device')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [look])

  const setLook = useCallback((next: Look) => {
    try {
      if (next === 'device') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      // Private browsing: the choice lasts until the page closes.
    }
    apply(next)
    setLookState(next)
  }, [])

  return { look, setLook }
}
