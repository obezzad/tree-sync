import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';

export default {
  input: 'lib/index.js',
  output: {
    file: 'dist/bundle.mjs',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    json()
  ],
  external: [
    'js-logger'
  ]
};
