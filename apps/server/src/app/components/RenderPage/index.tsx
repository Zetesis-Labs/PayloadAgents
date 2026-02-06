import type { Post } from '@payload-types'

import React from 'react'
import { LogoutButton } from './LogoutButton'

export const RenderPage = ({ data }: { data: Post }) => {
  return (
    <React.Fragment>
      <LogoutButton />
      <h2>Here you can decide how you would like to render the page data!</h2>

      <code>{JSON.stringify(data)}</code>
    </React.Fragment>
  )
}
