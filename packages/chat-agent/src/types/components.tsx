import type React from 'react'

/**
 * Props for a Link component that can be injected
 * Compatible with next/link and regular <a> tags
 */
export interface LinkComponentProps {
  href: string
  children: React.ReactNode
  onClick?: () => void
  className?: string
  target?: string
  'aria-label'?: string
  title?: string
}

/**
 * Type for a Link component that can be injected from outside
 * Default fallback is a regular <a> tag
 */
export type LinkComponent = React.ComponentType<LinkComponentProps>

/**
 * Props for an Image component that can be injected
 * Compatible with next/image and regular <img> tags
 */
export interface ImageComponentProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
}

/**
 * Type for an Image component that can be injected from outside
 * Default fallback is a regular <img> tag
 */
export type ImageComponent = React.ComponentType<ImageComponentProps>

/**
 * Default Link component fallback (regular <a> tag)
 */
export const DefaultLink: LinkComponent = ({
  href,
  children,
  onClick,
  className,
  target,
  'aria-label': ariaLabel,
  title
}) => (
  <a href={href} onClick={onClick} className={className} target={target} aria-label={ariaLabel} title={title}>
    {children}
  </a>
)

/**
 * Default Image component fallback (regular <img> tag)
 */
export const DefaultImage: ImageComponent = ({ src, alt, width, height, className }) => (
  <img src={src} alt={alt} width={width} height={height} className={className} />
)
