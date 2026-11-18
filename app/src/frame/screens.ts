// The nine screens, in the master plan's order. The menu, each page's
// "coming soon" sentence and the route files all follow this one list
// (a test fails if they disagree).
import {
  IconBuildingEstate,
  IconChecklist,
  IconCoin,
  IconNotes,
  IconRobot,
  IconSettings,
  IconSun,
  IconUsers,
  IconWorld,
  type Icon,
} from '@tabler/icons-react'

export const SCREEN_PATHS = ['/', '/approvals', '/contacts', '/deals', '/notes', '/money', '/website', '/agents', '/settings'] as const
export type ScreenPath = (typeof SCREEN_PATHS)[number]

export type Screen = {
  to: ScreenPath
  name: string
  icon: Icon
  /** What will be there, in one honest sentence. Nothing on it is built yet. */
  soon: string
}

export const SCREENS: readonly Screen[] = [
  { to: '/', name: 'Today', icon: IconSun, soon: 'The few things that need you today: deadlines, new leads, and calls and texts with the words ready.' },
  { to: '/approvals', name: 'Approvals', icon: IconChecklist, soon: 'Every message drafted for you, in full, waiting for Send, Edit or Skip.' },
  { to: '/contacts', name: 'Contacts', icon: IconUsers, soon: 'Every client, lead and business contact, each with a detailed page and where they stand.' },
  { to: '/deals', name: 'Deals', icon: IconBuildingEstate, soon: 'One card for each sale or purchase, with its timeline and everyone involved.' },
  { to: '/notes', name: 'Notes', icon: IconNotes, soon: 'Notes you speak or type, filed to the right person or deal once you approve.' },
  { to: '/money', name: 'Money', icon: IconCoin, soon: 'Commissions earned and expected, receipts and mileage, by month, quarter and year.' },
  { to: '/website', name: 'Website', icon: IconWorld, soon: 'How your website is doing in plain words, and content drafts waiting for you.' },
  { to: '/agents', name: 'Agents', icon: IconRobot, soon: 'What each AI helper does, what it did this week, and how much it may do without asking.' },
  { to: '/settings', name: 'Settings', icon: IconSettings, soon: 'Your details, email connections, brokerage fees and spending limit.' },
]

export const screenAt = (to: ScreenPath): Screen => SCREENS.find((s) => s.to === to)!
