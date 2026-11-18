import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon, titleFor } from '@/frame/coming-soon'

export const Route = createFileRoute('/_in/_frame/settings')({
  head: () => titleFor('/settings'),
  component: () => <ComingSoon to="/settings" />,
})
