const production = process.env.NODE_ENV === 'production';
import TerserPlugin from 'terser-webpack-plugin';
import path from 'path';
import DeleteAssetsPlugin from './deletePlugin.plugin.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default () => {
  return {
    entry: {
      SharedSyncImplementation: path.join(__dirname, './lib/src/worker/sync/SharedSyncImplementation.worker.js'),
      WASQLiteDB: path.join(__dirname, './lib/src/worker/db/WASQLiteDB.worker.js')
    },
    experiments: {
      topLevelAwait: true // Enable top-level await in Webpack
    },
    output: {
      filename: 'worker/[name].umd.js',
      path: path.join(__dirname, 'dist'),
      library: {
        name: 'sdk_web',
        type: 'var'
      }
    },
    target: 'webworker',
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

    devtool: production ? 'source-map' : 'cheap-module-source-map',
    mode: production ? 'production' : 'development',
    optimization: {
      splitChunks: false,
      minimizer: [new TerserPlugin()]
    },
    plugins: [
      new DeleteAssetsPlugin() // Add the custom plugin here
    ]
  };
};
