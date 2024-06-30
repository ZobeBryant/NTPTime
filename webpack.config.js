const path = require("path");
const config = require("./webpack.config.base");

Object.assign(config, {
  entry: {
    TimeOrigin: [path.resolve(__dirname, "src", "index.ts")],
  },
  output: {
    filename: `[name].js`,
    path: path.resolve(__dirname, "dist"),
    libraryTarget: "umd",
    libraryExport: "default",
    library: "[name]",
  },
});

module.exports = config;
