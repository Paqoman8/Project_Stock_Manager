import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Requis pour activer forbidden() et le fichier forbidden.tsx
    // Voir : next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md
    authInterrupts: true,
  },
  allowedDevOrigins: ['192.168.2.22', 'localhost'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
