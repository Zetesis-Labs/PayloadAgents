export const COLLECTION_SLUG_PRODUCTS = 'products' as const
export const COLLECTION_SLUG_PRICES = 'prices' as const
export const COLLECTION_SLUG_CUSTOMERS = 'customers' as const

export const QUERY_PERMISSION_TYPES = {
  ALL: 'all',
  ROLES: 'roles',
  ONLY_NO_ROLES: 'only_no_roles',
  ONLY_GUESS: 'only_guess'
} as const

const FREEMIUM_PERMISSION = 'freemium'
const FREE_PERMISSION = 'free'
const TESTER_PERMISSION = 'tester'
const DEV_PERMISSION = 'dev'
const BASIC_PERMISSION = 'basic'
const ADMIN_PERMISSION = 'web_admin'

export const permissionSlugs = {
  webAdmin: ADMIN_PERMISSION,
  dev: DEV_PERMISSION,
  tester: TESTER_PERMISSION,
  free: FREE_PERMISSION,
  freemium: FREEMIUM_PERMISSION,
  basic: BASIC_PERMISSION
}

export const PERMISSIONS = [
  { id: 5, slug: FREE_PERMISSION, title: 'Free' },
  { id: 6, slug: FREEMIUM_PERMISSION, title: 'Freemium' },
  { id: 3, slug: TESTER_PERMISSION, title: 'Tester' },
  { id: 2, slug: DEV_PERMISSION, title: 'Developer' },
  { id: 1, slug: BASIC_PERMISSION, title: 'Basic' },
  { id: 4, slug: ADMIN_PERMISSION, title: 'Admin' }
]
export const PricingType = {
  one_time: 'One Time',
  recurring: 'Recurring'
} as const

export const PricingPlanInterval = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year'
} as const

export const formatOptions = (obj: Record<string, string>) =>
  Object.entries(obj).map(([key, value]) => ({ value: key, label: value }))
