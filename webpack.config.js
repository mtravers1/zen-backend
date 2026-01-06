import webpack from "webpack";
import path from "path";
import fs from "fs";
import TerserPlugin from "terser-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import nodeExternals from 'webpack-node-externals';







export default {
  entry: "./safe-entry.js",
  target: "node",
  mode: "production",
  node: {
    __dirname: true,
  },
  output: {
    filename: "index.js",
    path: path.resolve(process.cwd(), "dist"),
    library: {
      type: "module",
    },
  },
  experiments: {
    outputModule: true,
  },
  module: {
    rules: [
      {
        test: /\.node$/,
        loader: "node-loader",
      },
    ],
  },
  devtool: "source-map",
  plugins: [
    new TerserPlugin({
      terserOptions: {
        ecma: 2022,
      },
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "lib/mailer/templates/",
          to: "./lib/mailer/templates/",
          noErrorOnMissing: true,
        },
        { from: "ecosystem.config.cjs", to: "./ecosystem.config.cjs" },
        { from: "package.json", to: "." },
        { from: "package-lock.json", to: "." },
        { from: "instrument.mjs", to: "." },
        
        { from: ".env.sample", to: ".", noErrorOnMissing: true },
        { from: "scripts/", to: "./scripts/", noErrorOnMissing: true },
        { from: "config/", to: "./config/", noErrorOnMissing: true },
        { from: "constants/", to: "./constants/", noErrorOnMissing: true },
        { from: "database/", to: "./database/", noErrorOnMissing: true },
        { from: "middlewares/", to: "./middlewares/", noErrorOnMissing: true },
        { from: "routes/", to: "./routes/", noErrorOnMissing: true },
        { from: "controllers/", to: "./controllers/", noErrorOnMissing: true },
        { from: "services/", to: "./services/", noErrorOnMissing: true },
        { from: "lib/", to: "./lib/", noErrorOnMissing: true },
        { from: "utils/", to: "./utils/", noErrorOnMissing: true },
        { from: "bin/", to: "./bin/", noErrorOnMissing: true },
        { from: "app.js", to: "." },
      ],
    }),
    new webpack.WatchIgnorePlugin({
      paths: [/\.d\.ts$/],
    }),
    new webpack.IgnorePlugin({
      resourceRegExp: /^(kerberos|@mongodb-js\/zstd|@aws-sdk\/credential-providers|gcp-metadata|snappy|socks|aws4)$/,
      contextRegExp: /mongodb/,
    }),
  ],
  resolve: {
    extensions: [".js", ".mjs"],
  },
  externals: [nodeExternals({
    importType: 'module'
  })],


};
