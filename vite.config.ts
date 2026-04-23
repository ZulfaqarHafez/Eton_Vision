import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function getPackageName(id: string): string | null {
  const marker = "node_modules/";
  const idx = id.lastIndexOf(marker);
  if (idx === -1) return null;

  const remainder = id.slice(idx + marker.length);
  const parts = remainder.split("/");
  if (parts.length === 0) return null;

  if (parts[0].startsWith("@") && parts.length > 1) {
    return `${parts[0]}/${parts[1]}`;
  }

  return parts[0];
}

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
    // face-api.js 0.22.2 imports @tensorflow/tfjs-core as a peer dep. Without
    // dedupe, Vite's dev pre-bundler ends up with two copies — face-api uses
    // one, our direct `import * as tf from '@tensorflow/tfjs-core'` uses
    // another — so tf.setBackend() configures a different engine than the
    // one face-api's computeFaceDescriptor hits. Forcing a single instance
    // fixes the "Cannot read properties of undefined (reading 'backend')"
    // crash inside face-api's WebGL program runner.
    dedupe: ["@tensorflow/tfjs-core"],
  },
  optimizeDeps: {
    // Keep tfjs-core in the pre-bundle graph with face-api so Vite sees them
    // as the same module instance.
    include: ["face-api.js", "@tensorflow/tfjs-core"],
  },
  build: {
    // Face-recognition workloads include a large tfjs-core chunk even after code splitting.
    // Raise the warning threshold so remaining warnings are meaningful regressions.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const pkgName = getPackageName(id);
          if (!pkgName) return;

          if (["react", "react-dom", "react-router-dom", "scheduler"].includes(pkgName)) {
            return "framework";
          }

          if (pkgName === "face-api.js") {
            return "vision-face-api";
          }

          if (pkgName.startsWith("@tensorflow/")) {
            return `vision-${pkgName.replace("@tensorflow/", "tf-")}`;
          }

          if (["framer-motion", "lucide-react", "sonner"].includes(pkgName) || pkgName.startsWith("@radix-ui/")) {
            return "ui-kit";
          }

          if (pkgName === "@supabase/supabase-js") {
            return "data-client";
          }

          return "vendor";
        },
      },
    },
  },
}; });
