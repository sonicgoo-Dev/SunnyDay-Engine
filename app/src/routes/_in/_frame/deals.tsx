import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon, titleFor } from '@/frame/coming-soon'

export const Route = createFileRoute('/_in/_frame/deals')({
  head: () => titleFor('/deals'),
  component: () => <ComingSoon to="/deals" />,
})
