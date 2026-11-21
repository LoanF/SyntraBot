import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Une seule source de configuration : le .env à la racine du monorepo (en Docker, les variables viennent de l'environnement)
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  /* fichier absent : rien à charger */
}

const config: NextConfig = {
  // Packages du monorepo publiés en TypeScript brut
  transpilePackages: ['@syntra/shared', '@syntra/db', '@syntra/security', '@syntra/core', '@syntra/ui'],
  // Dépendances natives / serveur uniquement
  serverExternalPackages: ['@prisma/client', 'ioredis', 'bullmq', 'mysql2', 'undici'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default config;
