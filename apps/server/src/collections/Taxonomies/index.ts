import { isSuperAdminAccess } from '@/access/isSuperAdmin'
import { taxonomiesCollection } from '@nexo-labs/payload-taxonomies'

export const Taxonomies = taxonomiesCollection({
  access: {
    create: isSuperAdminAccess,
    update: isSuperAdminAccess,
    delete: isSuperAdminAccess,
    read: () => true,
  },
})
