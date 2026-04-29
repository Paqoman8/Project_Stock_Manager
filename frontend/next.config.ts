import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Requis pour activer forbidden() et le fichier forbidden.tsx
    // Voir : next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md
    authInterrupts: true,
  },
};

export default nextConfig;
