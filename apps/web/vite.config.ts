import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  return {
    envDir: rootDir,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: true,
      proxy: { '/api': `http://localhost:${env.API_PORT ?? 3000}` },
    },
  };
});
