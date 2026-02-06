import type { Plugin } from 'payload'
import { authjsPlugin } from 'payload-authjs'
import { authConfig } from './authjs-config'

const config: Plugin = authjsPlugin({
  authjsConfig: authConfig
})

export default config
