import React from 'react'

import './index.scss'

const baseClass = 'multi-tenant'

export const metadata = {
  description: 'Powered by Kogito.es - Multi-tenant AI CMS',
  title: 'Kogito.es',
}

// eslint-disable-next-line no-restricted-exports
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={baseClass} lang="en">
      <body>{children}</body>
    </html>
  )
}
