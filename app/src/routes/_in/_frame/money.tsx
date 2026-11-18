import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon, titleFor } from '@/frame/coming-soon'

export const Route = createFileRoute('/_in/_frame/money')({
  head: () => titleFor('/money'),
  component: () => <ComingSoon to="/money" />,
})
