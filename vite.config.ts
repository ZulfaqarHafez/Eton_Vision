import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const colabUrl = env.VITE_COLAB_URL || 'https://8000-gpu-t4-s-ts859nfedjae-c.us-east1-0.prod.colab.dev';

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api/colab': {
        target: colabUrl,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/colab/, ''),
        secure: false,
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}; });
