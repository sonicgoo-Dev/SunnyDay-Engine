import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon, titleFor } from '@/frame/coming-soon'

export const Route = createFileRoute('/_in/_frame/notes')({
  head: () => titleFor('/notes'),
  component: () => <ComingSoon to="/notes" />,
})
