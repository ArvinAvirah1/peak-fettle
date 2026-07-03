// Babel config for Peak Fettle LifeOS (Expo SDK 54) — mirrors mobile/babel.config.js.
//
// `babel-preset-expo` provides the JSX/TS transform, expo-router support, and
// (SDK 54) AUTOMATICALLY adds the react-native-worklets Babel plugin when
// react-native-worklets is installed (it is — reanimated v4 depends on it).
//
// Do NOT manually add 'react-native-reanimated/plugin' or
// 'react-native-worklets/plugin' here — the preset adds it exactly once, and
// adding it again makes Reanimated throw "plugin applied more than once" on
// launch (and reanimated v4 no longer ships that plugin path at all, which
// breaks the bundle outright). This exact mistake shipped a boot-crash in the
// fitness app once — see mobile/babel.config.js for the postmortem note.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
