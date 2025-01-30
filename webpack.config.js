import webpack from 'webpack';
import path from 'path';
import fs from 'fs';
import TerserPlugin from 'terser-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';

let nodeModules = {};
fs.readdirSync('node_modules')
  .filter((x) => x !== '.bin')
  .forEach((mod) => {
    nodeModules[mod] = 'commonjs ' + mod;
  });

export default {
  entry: './bin/www',
  target: 'node',
  mode: 'production',
  node: {
    __dirname: true,
  },
  output: {
    filename: 'index.js',
    path: path.resolve(process.cwd(), 'dist'),
  },
  devtool: 'source-map',
  plugins: [
    new TerserPlugin({
      parallel: true,
      terserOptions: {
        compress: false,
        ecma: 6,
        mangle: true,
        sourceMap: true,
      },
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'lib/mailer/templates/', to: './lib/mailer/templates/' },
        { from: 'ecosystem.config.js', to: './ecosystem.config.js' },
        { from: 'scripts/', to: './scripts/' },
        { from: 'package.json', to: '.' },
        { from: '.env.sample', to: '.' },
        { from: 'ServiceAccountKey.json', to: '.' },
      ],
    }),
    new webpack.WatchIgnorePlugin({
      paths: [/\.d\.ts$/],
    }),

  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.mjs'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
      },
    ],
  },
  externals: nodeModules,
};
