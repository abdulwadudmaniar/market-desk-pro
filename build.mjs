// Rebuilds public/app.js from src/ (only needed if you change the UI).  npm install && npm run build:ui
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  jsx: 'automatic',
  outfile: 'public/app.js',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [],
  logLevel: 'info',
});
