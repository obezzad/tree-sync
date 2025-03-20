const production = process.env.NODE_ENV === 'production';
import TerserPlugin from 'terser-webpack-plugin';
import path from 'path';
import DeleteAssetsPlugin from './deletePlugin.plugin.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import webpack from 'webpack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { LimitChunkCountPlugin } = webpack.optimize;

export default () => {
  return {
    entry: path.join(__dirname, './lib/src/index.js'),
    output: {
      filename: 'index.umd.js',
      path: path.join(__dirname, 'dist'),
      library: {
        name: 'sdk_web',
        type: 'umd'
      }
    },
    module: {
      rules: [
        {
          enforce: 'pre',
          test: /\.js$/,
          loader: 'source-map-loader'
        }
      ]
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      fallback: {
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        vm: 'vm-browserify'
      },
      alias: {
        bson: path.resolve(__dirname, 'node_modules/bson/lib/bson.cjs')
      }
    },

    externals: {
      '@journeyapps/wa-sqlite': '@journeyapps/wa-sqlite',
      '@journeyapps/wa-sqlite/src/examples/IDBBatchAtomicVFS.js':
        '@journeyapps/wa-sqlite/src/examples/IDBBatchAtomicVFS.js',
      '@powersync/common': '@powersync/common',
      'async-mutex': 'async-mutex',
      comlink: 'comlink',
      'js-logger': 'js-logger',
      lodash: 'lodash'
    },
    devtool: production ? 'source-map' : 'cheap-module-source-map',
    mode: production ? 'production' : 'development',
    optimization: {
      minimizer: [new TerserPlugin()]
    },
    plugins: [
      new LimitChunkCountPlugin({
        maxChunks: 1 // There are issues with loading the dynamic BSON import, it works if the bson dependency is in the index bundle file
      }),
      new DeleteAssetsPlugin() // Add the custom plugin here
    ]
  };
};
