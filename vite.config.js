import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// We use path for alias resolution, though we abandoned the alias, 
// keeping it here for stability just in case.
import path from 'path'; 

// This configuration is crucial for Vercel/production builds.
export default defineConfig({
  plugins: [react()],
  // Alias is kept to demonstrate proper setup, but the code now uses relative paths
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // We removed publicDir and root when we moved index.html to the root.

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  
  // *** CRITICAL FIX: Ensure VITE prefix is used in the constant name ***
  // We use the 'define' property to explicitly embed the VITE_GEMINI_API_KEY
  // value into the final JavaScript bundle during the build.
  // The value is read from Vercel's environment variables.
  define: {
    'process.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY),
  },
});
