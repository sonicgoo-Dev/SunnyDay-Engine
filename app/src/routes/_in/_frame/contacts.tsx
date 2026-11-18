import { createFileRoute } from '@tanstack/react-router'
import { ComingSoon, titleFor } from '@/frame/coming-soon'

export const Route = createFileRoute('/_in/_frame/contacts')({
  head: () => titleFor('/contacts'),
  component: () => <ComingSoon to="/contacts" />,
})
