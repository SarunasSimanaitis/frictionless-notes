import { requireOptionalNativeModule } from 'expo-modules-core';

type TopicSubscriptionNativeModule = {
  subscribeToTopicAsync: (topic: string) => Promise<null>;
  unsubscribeFromTopicAsync: (topic: string) => Promise<null>;
};

// Topic subscriptions are push-only and are not included in Expo Go on Android.
// Keep the package import safe there, while using the native implementation in
// builds that provide it. expo-notifications reports the API as unavailable
// when either method is absent.
export default requireOptionalNativeModule<TopicSubscriptionNativeModule>(
  'ExpoTopicSubscriptionModule'
) ?? {};
