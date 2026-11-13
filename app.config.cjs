// Adds an optional "compare" variant on top of app.json.
//
// Building with APP_VARIANT=compare gives the app its own package name and label, so it
// installs next to the released app instead of replacing it. The two keep separate notes.
// Without the variable this file changes nothing.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'compare') return config;
  return {
    ...config,
    name: `${config.name} (new)`,
    android: { ...config.android, package: `${config.android.package}.compare` },
    ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.compare` },
  };
};
