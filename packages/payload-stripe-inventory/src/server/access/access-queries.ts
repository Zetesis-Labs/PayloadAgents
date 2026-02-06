import type { Access } from 'payload'
import { permissionSlugs } from '../../model/constants'

export const isAdmin: Access = ({ req }) => {
  return req?.user?.roles?.includes(permissionSlugs.webAdmin) || false
}

export const isAnyone: Access = () => true

export const isAdminOrCurrentUser: Access = ({ req }) => {
  if (req?.user?.roles?.includes(permissionSlugs.webAdmin)) return true
  return { id: { equals: req.user?.id } }
}

export const isAdminOrPublished: Access = ({ req: { user } }) => {
  if (user?.roles?.includes(permissionSlugs.webAdmin)) {
    return true
  }

  return {
    _status: {
      equals: 'published'
    }
  }
}

export const isAdminOrStripeActive: Access = ({ req: { user } }) => {
  if (user?.roles?.includes(permissionSlugs.webAdmin)) {
    return true
  }

  return {
    active: {
      equals: true
    }
  }
}

export const isAdminOrUserFieldMatchingCurrentUser: Access = ({ req: { user } }) => {
  if (user) {
    if (user?.roles?.includes(permissionSlugs.webAdmin)) return true
    return {
      user: {
        equals: user?.id
      }
    }
  }
  return false
}

export const loggedInOrPublished: Access = ({ req: { user } }) => {
  if (user) {
    return true
  }

  return {
    _status: {
      equals: 'published'
    }
  }
}
