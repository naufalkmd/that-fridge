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
      backgroundColor: "#0b0f14",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 160,
        resizeMode: "contain",
        backgroundColor: "#0b0f14",
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
