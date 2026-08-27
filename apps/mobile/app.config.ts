import type { ExpoConfig } from "expo/config";

// iOS-first. Android keys are kept so `eas build -p android` works later, but Android
// is a post-launch effort — see APP_STORE_LAUNCH_PLAN.md §9.
const config: ExpoConfig = {
  name: "ThatFridge",
  slug: "thatfridge",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "thatfridge",
  userInterfaceStyle: "automatic",
  owner: "avocacode",
  extra: {
    eas: {
      projectId: "9d32771d-73bf-4ee1-9a24-fbd96b2a3ddc",
    },
  },
  updates: {
    url: "https://u.expo.dev/9d32771d-73bf-4ee1-9a24-fbd96b2a3ddc",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "test.thatfridge.app",
    buildNumber: "1",
    infoPlist: {
      // No custom/proprietary encryption — lets App Store Connect skip the export-compliance prompt.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "app.thatfridge",
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundColor: "#0a0a0c",
    },
  },
  // Universal: the same screens render on the web via react-native-web. Live web
  // deployment is a post-launch fast-follow — see APP_STORE_LAUNCH_PLAN.md.
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-font",
      {
        fonts: ["./assets/fonts/PixelMix.ttf", "./assets/fonts/PixelMix-Bold.ttf"],
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0a0a0c",
        dark: { backgroundColor: "#0a0a0c" },
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "ThatFridge uses the camera to scan grocery barcodes.",
        // Barcode scanning only — no mic. Keeps the iOS review surface minimal.
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-notifications",
      {
        // Local notifications only for v1 (expiry / low-stock reminders).
        // Server push (APNs) is a post-launch fast-follow.
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
