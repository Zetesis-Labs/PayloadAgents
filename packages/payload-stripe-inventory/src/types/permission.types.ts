import type { Customer } from './customer.types'

export interface Subscription {
  status?: string
}

export interface BaseUser<T = unknown> {
  id: string | number
  name?: string
  email?: string
  customer?: Customer | null
  roles?: string[]
  inventory?: T
  [key: string]: unknown
}

export interface User extends BaseUser {}
