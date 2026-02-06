'use client'

import { ArrowRight } from 'lucide-react'
import { DefaultLink, type LinkComponent } from '../../types/components'

interface ViewMoreLinkProps {
  type: 'article' | 'book'
  slug: string
  title: string
  onClick?: () => void
  generateHref: (props: { type: string; value: { id: number; slug?: string | null } }) => string
  LinkComponent?: LinkComponent
}

export const ViewMoreLink = ({
  type,
  slug,
  title,
  onClick,
  generateHref,
  LinkComponent: Link = DefaultLink
}: ViewMoreLinkProps) => {
  const contentType = type === 'article' ? 'articulos' : 'libros'
  const href = generateHref({
    type: contentType,
    value: { id: parseInt(slug.split('-')?.[0] || '0'), slug }
  })
  if (!href) return null

  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors mt-2"
      title={`Ver más sobre ${title}`}
    >
      Ver documento completo
      <ArrowRight className="w-4 h-4" />
    </Link>
  )
}
