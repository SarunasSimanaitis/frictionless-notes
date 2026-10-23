const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const topicSubscriptionShim = path.resolve(
  __dirname,
  'src/shims/TopicSubscriptionModule.android.ts',
);
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath.replaceAll('\\', '/');
  const isTopicSubscriptionImport =
    moduleName === './TopicSubscriptionModule' &&
    (origin.endsWith('/expo-notifications/build/topicSubscription.js') ||
      origin.endsWith('/expo-notifications/src/topicSubscription.ts'));

  if (platform === 'android' && isTopicSubscriptionImport) {
    return { type: 'sourceFile', filePath: topicSubscriptionShim };
  }

  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
