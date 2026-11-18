// An error answer is never kept by a browser. Without this, a phone can
// remember a file as "missing" for a year if it asked during a deploy
// (learned on Oomph Engine, Nov 11, 2026).
import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', (res) => {
    if (res.status >= 400) res.headers.set('cache-control', 'no-store')
  })
})
