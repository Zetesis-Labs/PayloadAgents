import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Needed for workspace packages that use .js extensions in TS imports
  // Remove once packages migrate to extensionless imports (then Turbopack works natively)
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
    }
    return config
  },
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
