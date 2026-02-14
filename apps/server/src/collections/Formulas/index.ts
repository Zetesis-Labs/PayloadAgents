import type { CollectionConfig } from 'payload'

export const Paper: CollectionConfig = {
  slug: 'paper',
  admin: {
    useAsTitle: 'title'
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Nombre identificativo de la fórmula'
      }
    },
    {
      name: 'description',
      type: 'textarea',
      required: false,
      admin: {
        description: 'Descripción opcional de la fórmula'
      }
    },
    {
      name: 'latex',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Contenido LaTeX de la fórmula',
        components: {
          Field: '@/modules/payload-admin/latex-field'
        }
      }
    }
  ]
}
