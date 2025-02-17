const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'production',
  entry: {
    'worker/WASQLiteDB': './lib/src/worker/db/WASQLiteDB.worker.js',
    'worker/SharedSyncImplementation': './lib/src/worker/sync/SharedSyncImplementation.worker.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].umd.js',
    library: {
      type: 'umd'
    }
  },
  externals: [nodeExternals()],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()]
  },
  resolve: {
    extensions: ['.js', '.ts']
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['source-map-loader'],
        enforce: 'pre'
      }
    ]
  }
};
