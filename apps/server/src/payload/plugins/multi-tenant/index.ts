import { multiTenantPlugin as _multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import type { Config } from '@payload-types'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

export const multiTenantPlugin = _multiTenantPlugin<Config>({
      collections: {
        posts: {},
        books: {},
        agents: {},
      },
      tenantField: {
        access: {
          read: () => true,
          update: ({ req }) => {
            if (isSuperAdmin(req.user)) {
              return true
            }
            return getUserTenantIDs(req.user).length > 0
          },
        },
      },
      tenantsArrayField: {
        includeDefaultField: false,
      },
      userHasAccessToAllTenants: (user) => isSuperAdmin(user),
    }
)