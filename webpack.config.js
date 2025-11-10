import webpack from "webpack";
import path from "path";
import fs from "fs";
import TerserPlugin from "terser-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";



let nodeModules = {};
fs.readdirSync("node_modules")
  .filter((x) => x !== ".bin")
  .forEach((mod) => {
    nodeModules[mod] = "commonjs " + mod;
  });

export default {
  entry: "./bin/www",
  target: "node",
  mode: "production",
  node: {
    __dirname: true,
  },
  output: {
    filename: "index.js",
    path: path.resolve(process.cwd(), "dist"),
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
        {
          from: "lib/mailer/templates/",
          to: "./lib/mailer/templates/",
          noErrorOnMissing: true,
        },
        { from: "ecosystem.config.js", to: "./ecosystem.config.js" },
        { from: "package.json", to: "." },
        { from: "package-lock.json", to: "." },
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
        { from: "bin/", to: "./bin/", noErrorOnMissing: true },
        { from: "app.js", to: "." },
      ],
    }),
    new webpack.WatchIgnorePlugin({
      paths: [/\.d\.ts$/],
    }),
  ],
  resolve: {
    extensions: [".js", ".mjs"],
  },
  externals: nodeModules,

};
