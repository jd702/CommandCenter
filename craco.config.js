const path = require("path");

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve = {
        ...(webpackConfig.resolve || {}),
        fallback: {
          ...(webpackConfig.resolve.fallback || {}),
          timers: require.resolve("timers-browserify"),
        },
      };
      return webpackConfig;
    },
  },
};
