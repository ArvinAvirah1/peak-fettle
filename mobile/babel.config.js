// Babel config for the Peak Fettle Expo app (SDK 54).
//
// `babel-preset-expo` is REQUIRED for an Expo project — it provides the JSX/TS
// transform, expo-router support, and (SDK 54) AUTOMATICALLY adds the
// react-native-worklets Babel plugin when react-native-worklets is installed
// (it is — reanimated v4 depends on it). See babel-preset-expo build/index.js.
//
// Do NOT manually add 'react-native-worklets/plugin' or
// 'react-native-reanimated/plugin' here — the preset adds it exactly once, and
// adding it again makes Reanimated throw "plugin applied more than once" on launch.
// Do NOT add the legacy 'expo-router/babel' plugin — it was removed in
// expo-router 4+ (folded into babel-preset-expo) and will fail to resolve.
//
// Its absence is what caused the app to bundle/submit successfully but crash
// immediately on launch: without the preset, Metro bundled via a fallback that
// transforms JSX but NOT Reanimated worklets, so the first worklet threw at boot.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
