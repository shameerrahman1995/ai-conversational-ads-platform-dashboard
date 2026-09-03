import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@acp/ui', '@acp/shared-types', '@acp/api-client'],
};
export default nextConfig;
