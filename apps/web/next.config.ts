import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile the monorepo game-engine package so Next.js can process its ESM source
  transpilePackages: ['@turuf/game-engine'],

  // Use Webpack instead of Turbopack (Turbopack requires native bindings not
  // available on all platforms; Webpack works everywhere)
  turbopack: undefined,

  experimental: {
    // Optimize imports from large packages
    optimizePackageImports: ['ably'],
  },
};

export default nextConfig;
