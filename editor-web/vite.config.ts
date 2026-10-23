import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: resolve(process.cwd(), 'editor-web'),
  base: './',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    assetsInlineLimit: 1_000_000_000,
  },
  resolve: {
    alias: [
      { find: '@10play/tentap-editor', replacement: '@10play/tentap-editor/web' },
      { find: '@tiptap/pm/view', replacement: '@10play/tentap-editor/web' },
      { find: '@tiptap/pm/state', replacement: '@10play/tentap-editor/web' },
    ],
  },
  plugins: [react(), viteSingleFile()],
});
