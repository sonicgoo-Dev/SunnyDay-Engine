// The part of shared that is safe in the browser: plain rules and the
// Zod checks for what the contact screens send. No database here, ever.
export * from './contacts/rules.js'
export * from './contacts/input.js'
export * from './list/rules.js'
