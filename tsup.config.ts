import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry (framework-agnostic)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react'],
    treeshake: true,
  },
  // React entry (optional)
  {
    entry: ['src/react/index.ts'],
    outDir: 'dist/react',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react'],
    treeshake: true,
  },
  // Host entry (for embedding MCP apps)
  {
    entry: ['src/host/index.ts'],
    outDir: 'dist/host',
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react'],
    treeshake: true,
  },
]);

