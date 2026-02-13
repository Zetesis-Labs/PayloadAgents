export const COLLECTION_SLUG_PRODUCTS = 'products' as const
export const COLLECTION_SLUG_PRICES = 'prices' as const
export const COLLECTION_SLUG_CUSTOMERS = 'customers' as const

export const QUERY_PERMISSION_TYPES = {
  ALL: 'all',
  ROLES: 'roles',
  ONLY_NO_ROLES: 'only_no_roles',
  ONLY_GUESS: 'only_guess'
} as const

export type QueryPermissionType = (typeof QUERY_PERMISSION_TYPES)[keyof typeof QUERY_PERMISSION_TYPES]

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
