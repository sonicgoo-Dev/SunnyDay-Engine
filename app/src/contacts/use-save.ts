// Runs one change on the contact page, then reloads what the page shows.
// A problem comes back as a plain sentence.
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { Done } from './contacts.schema'

export function useSave() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function run(work: () => Promise<Done>): Promise<boolean> {
    setBusy(true)
    setProblem(null)
    try {
      const done = await work()
      if (!done.ok) {
        setProblem(done.message)
        return false
      }
      await router.invalidate()
      return true
    } catch {
      setProblem('That did not save. Check what you typed and try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, problem, setProblem, run }
}
