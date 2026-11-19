// What the List Builder screens send and get back. The checks live in
// shared (browser-safe), so the screens and the server use the same ones;
// the server checks again whatever the browser did.
export * from '@sunnyday/shared/rules'

export type Done = { ok: true } | { ok: false; message: string }
export type Told<T> = ({ ok: true } & T) | { ok: false; message: string }
