// Runs once when the server starts, before it answers anything.
import { definePlugin } from 'nitro'
import { boot } from '../src/server/boot.server'

export default definePlugin(async (nitroApp) => {
  const stop = await boot()
  // A closed process must not linger on an open database connection.
  nitroApp.hooks.hook('close', stop)
})
