import { taxonomiesCollection } from '@nexo-labs/payload-taxonomies'
import { isSuperAdminAccess } from '@/access/isSuperAdmin'

export const Taxonomies = taxonomiesCollection({
  access: {
    create: isSuperAdminAccess,
    update: isSuperAdminAccess,
    delete: isSuperAdminAccess,
    read: () => true
  }
})
