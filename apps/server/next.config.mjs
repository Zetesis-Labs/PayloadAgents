import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  serverExternalPackages: [
    'payload',
    'sharp',
    'pino-pretty',
    'pg',
    '@payloadcms/db-postgres'
  ],
  turbopack: {},
}

export default withPayload(nextConfig)
