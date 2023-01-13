const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = function (env) {
  return {
    mode: env.production ? 'production' : 'development',
    devtool: env.production ? undefined : 'eval-source-map',
    entry: {
      page: path.join(__dirname, 'src/pageScript'),
    },
    output: {
      filename: '[name].bundle.js',
    },
    optimization: {
      minimize: false,
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.BABEL_ENV': JSON.stringify(process.env.NODE_ENV),
      }),
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configFile: 'tsconfig.json',
        },
      }),
      new CopyPlugin({
        patterns: [
          {
            from: path.join(__dirname, 'chrome/manifest.json'),
            to: path.join(__dirname, 'dist/manifest.json'),
          },
          {
            from: path.join(__dirname, 'src/assets'),
            to: path.join(__dirname, 'dist'),
          },
        ],
      }),
    ],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    module: {
      rules: [
        {
          test: /\.(js|ts)x?$/,
          use: 'babel-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css?$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.pug$/,
          use: ['file-loader?name=[name].html', 'pug-html-loader'],
        },
      ],
    },
  };
};
