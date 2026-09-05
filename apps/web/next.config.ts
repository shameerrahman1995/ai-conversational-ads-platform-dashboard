import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@acp/ui', '@acp/shared-types', '@acp/api-client'],
  // Emit a self-contained server (.next/standalone) for a minimal runtime image.
  // Tracing root is auto-detected as the monorepo root (single pnpm-lock.yaml).
  output: 'standalone',
};
export default nextConfig;
