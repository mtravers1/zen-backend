const webpack = require('webpack');
const path = require('path');
const fs = require('fs');
const TerserPlugin = require("terser-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin')
let nodeModules = {};
fs.readdirSync('node_modules')
  .filter(function (x) {
    return ['.bin'].indexOf(x) === -1;
  })
  .forEach(function (mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });
module.exports = {
  entry: './bin/www',
  target: 'node',
  mode: 'production',
  node: {
    __dirname: true
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, '.', 'dist')
  },
  devtool: 'source-map',
  plugins: [
    new TerserPlugin({
      parallel: true,
      terserOptions: {
        compress: false,
        ecma: 6,
        mangle: true,
        sourceMap: true
      }
    }),
    new CopyWebpackPlugin([
      { from: './lib/mailer/templates/', to: './lib/mailer/templates/' }
    ],{}),
    new CopyWebpackPlugin([
      { from: './views/', to: './views/' }
    ],{}),
    new CopyWebpackPlugin([
        { from: './wwwroot/', to: './wwwroot/' }
      ],{}),
    new webpack.WatchIgnorePlugin([
      /\.d\.ts$/
    ])
  ],
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js', '.mjs']
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      {
        test: /\.tsx?$/, loader: 'ts-loader',
      }
    ]
  },
  externals: nodeModules
};
