import { Field } from 'payload'

/**
 * Maps a field to include a conditional admin property
 */
const mapFieldToCondition =
  (key: string, selectorFieldName: string) =>
  (field: Field): Field =>
    ({
      ...field,
      admin: {
        ...field.admin,
        condition: (_, siblingData) => siblingData[selectorFieldName] === key,
      },
    }) as Field

interface BuildConditionalFieldProps<TKeys extends string> {
  /** Record of field arrays keyed by the selector value */
  fields: Record<TKeys, Field[]>
  /** Labels for each selector option */
  labels: Record<TKeys, string>
  /** Name of the selector field */
  name: string
  /** Label for the selector field */
  selectorLabel: string
  /** Default value for the selector (optional, defaults to first key) */
  defaultValue?: TKeys
}

/**
 * Build a conditional field group with a selector and conditional fields
 *
 * Creates a selector field that controls the visibility of other fields
 * based on the selected value. Uses generics to ensure type safety between
 * field keys, labels, and default values.
 *
 * @example
 * ```ts
 * buildConditionalField({
 *   name: 'linkType',
 *   selectorLabel: 'Link Type',
 *   defaultValue: 'internal',
 *   labels: {
 *     internal: 'Internal Link',
 *     external: 'External Link',
 *   },
 *   fields: {
 *     internal: [
 *       {
 *         name: 'page',
 *         type: 'relationship',
 *         relationTo: 'pages',
 *       },
 *     ],
 *     external: [
 *       {
 *         name: 'url',
 *         type: 'text',
 *       },
 *     ],
 *   },
 * })
 * ```
 */
export const buildConditionalField = <TKeys extends string>({
  fields,
  name,
  selectorLabel,
  labels,
  defaultValue,
}: BuildConditionalFieldProps<TKeys>): Field[] => {
  const keys = Object.keys(fields) as TKeys[]

  return [
    {
      type: 'select',
      name,
      options: keys.map((key) => ({
        label: labels[key],
        value: key,
      })),
      defaultValue: defaultValue ?? keys[0],
      label: selectorLabel,
    },
    ...Object.entries(fields)
      .map(([key, fieldList]) => (fieldList as Field[]).map(mapFieldToCondition(key, name)))
      .flat(),
  ]
}
