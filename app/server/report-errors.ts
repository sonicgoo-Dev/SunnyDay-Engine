// Every error the server meets while answering someone goes to Sentry
// (when SENTRY_DSN is set; startup turns it on). Cookies and other
// personal request details are not sent.
import * as Sentry from '@sentry/node'
import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    Sentry.captureException(error)
  })
})
