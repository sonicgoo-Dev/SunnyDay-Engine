// The nine screens sit inside the frame (the menu and its foot).
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { Frame } from '@/frame/frame'

export const Route = createFileRoute('/_in/_frame')({ component: FramedScreen })

function FramedScreen() {
  const { me } = Route.useRouteContext()
  return (
    <Frame me={me}>
      <Outlet />
    </Frame>
  )
}
