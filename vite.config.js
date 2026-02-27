import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; 

export default defineConfig(({ mode }) => {
  // Explicitly load env files based on the current mode ('development' or 'production')
  // This ensures variables are available during the config execution if needed
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    // Only use define if you want to use process.env in your client code
    // Standard practice is to use import.meta.env instead
    define: {
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
    },
  };
});