module.exports = {
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: ["babel-loader", "ts-loader"],
      },
      {
        test: /\.js$/,
        use: ["babel-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  mode: process.env.NODE_ENV,
  devtool: "source-map",
};
