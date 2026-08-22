import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Par défaut Vitest externalise les paquets de node_modules (require()
    // natif Node), ce qui contourne resolve.dedupe. Le monorepo npm workspaces
    // installe react/react-dom en double (frontend/node_modules ET racine, en
    // 19.2.4 vs 19.2.8) — sans forcer ces paquets à passer par le résolveur
    // Vite, @testing-library/react (hoisté à la racine) et le code applicatif
    // finissent chacun avec leur propre copie de react/react-dom, ce qui
    // casse les hooks ("Invalid hook call").
    server: {
      deps: {
        inline: [/react/, /@testing-library/],
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
