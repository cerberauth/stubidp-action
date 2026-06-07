import json from '@rollup/plugin-json'
import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const sharedPlugins = [
  typescript(),
  nodeResolve({ preferBuiltins: true }),
  json(),
  commonjs()
]

export default [
  {
    input: 'src/index.ts',
    output: {
      esModule: true,
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true
    },
    plugins: sharedPlugins
  },
  {
    input: 'src/post-entry.ts',
    output: {
      esModule: true,
      file: 'dist/post.js',
      format: 'es',
      sourcemap: true
    },
    plugins: sharedPlugins
  }
]
