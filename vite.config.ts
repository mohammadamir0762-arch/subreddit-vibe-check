import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { devApi } from './vite-plugins/dev-api.ts';

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars to client code, and never populates
  // process.env. The dev API middleware runs in Node and reads the Reddit
  // credentials from process.env, so we bridge `.env` across explicitly here.
  // Production is unaffected — Vercel injects real env vars into the function.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT']) {
    if (env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), devApi()],
    build: {
      rollupOptions: {
        output: {
          // The AFINN + VADER lexicons are sizeable and never change; splitting
          // them out lets the browser cache them across app deploys.
          manualChunks(id: string) {
            if (id.includes('vader-sentiment') || id.includes('/sentiment/')) return 'sentiment';
            return undefined;
          },
        },
      },
    },
  };
});
