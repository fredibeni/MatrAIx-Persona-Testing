import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import type { Plugin as PostcssPlugin } from 'postcss';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const validationRoot = '#validation-root';

function scopeSelector(selector: string) {
  const trimmed = selector.trim();
  if (trimmed.startsWith(validationRoot)) return trimmed;

  for (const documentRoot of [':root', 'html', 'body']) {
    if (!trimmed.startsWith(documentRoot)) continue;
    const boundary = trimmed.at(documentRoot.length);
    if (
      boundary === undefined ||
      [' ', '.', '#', '[', ':', '>'].includes(boundary)
    ) {
      return `${validationRoot}${trimmed.slice(documentRoot.length)}`;
    }
  }

  return `${validationRoot} ${trimmed}`;
}

const scopeValidationCss: PostcssPlugin = {
  postcssPlugin: 'scope-matraix-validation',
  Rule(rule) {
    if (
      rule.parent?.type === 'atrule' &&
      rule.parent.name.toLowerCase().endsWith('keyframes')
    ) {
      return;
    }
    rule.selectors = rule.selectors.map(scopeSelector);
  },
};

export default defineConfig({
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), scopeValidationCss],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  build: {
    outDir: 'matraix/personal-persona/survey/assets',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(
        new URL('./app/validation-entry.tsx', import.meta.url),
      ),
      formats: ['es'],
      fileName: () => 'validation.js',
    },
    rolldownOptions: {
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.names.some((name) => name.endsWith('.css'))
            ? 'validation.css'
            : '[name]-[hash][extname]',
      },
    },
  },
});
