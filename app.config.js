/** @type {import('@expo/config').ConfigContext} */
module.exports = ({ config }) => {
  return {
    ...config,
    experiments: {
      ...config.experiments,
      // Lets the web build be hosted under a subpath, e.g. GitHub Pages
      // project sites (https://<user>.github.io/<repo>/). Leave unset for
      // local dev so `expo start --web` still serves from `/`.
      baseUrl: process.env.EXPO_BASE_URL ?? '',
    },
  };
};
