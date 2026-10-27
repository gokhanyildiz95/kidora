import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // API_URL lets you point the dev proxy at a different port if 4610 is taken.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // 127.0.0.1 rather than localhost: on macOS localhost may resolve to ::1 and hit another process.
      proxy: { '/api': env.API_URL ?? 'http://127.0.0.1:4610' },
    },
  };
});
