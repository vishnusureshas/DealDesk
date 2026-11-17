import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VITE_GIT_SHA ||
  process.env.GIT_SHA ||
  process.env.COMMIT_SHA ||
  '';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'inject-commit-meta',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `    <meta name="app-commit" content="${commitSha}" />\n  </head>`,
        );
      },
    },
  ],
  server: { port: 5173 },
});