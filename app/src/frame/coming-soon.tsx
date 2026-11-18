import { screenAt, type ScreenPath } from './screens'

/** A screen not built yet: its name and one honest sentence. No sample data. */
export function ComingSoon({ to }: { to: ScreenPath }) {
  const screen = screenAt(to)
  return (
    <div className="flex flex-col gap-6 px-4 py-8 md:px-12 md:py-12">
      <h1 className="text-3xl font-medium md:text-4xl">{screen.name}</h1>
      <section className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <screen.icon aria-hidden />
        </span>
        <h2 className="text-xl font-medium">Coming soon</h2>
        <p className="max-w-md text-muted-foreground">{screen.soon}</p>
      </section>
    </div>
  )
}

export const titleFor = (to: ScreenPath) => ({ meta: [{ title: `${screenAt(to).name} · SunnyDay` }] })
