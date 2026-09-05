import type { ExpoConfig } from "expo/config";

// iOS-first. Android keys are kept so `eas build -p android` works later, but Android
// is a post-launch effort — see TO_DO.md §7.
const config: ExpoConfig = {
  name: "ThatFridge",
  slug: "thatfridge",
  version: "1.2.0",
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
    // Ignored: eas.json cli.appVersionSource is "remote", so EAS auto-increments the real
    // build number on every production build. Bump `version` above by hand instead — see RELEASE.md.
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
      backgroundColor: "#1aa9bd",
    },
  },
  // Universal: the same screens render on the web via react-native-web. Live web
  // deployment is a post-launch fast-follow — see TO_DO.md.
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "@react-native-community/datetimepicker",
    [
      "expo-font",
      {
        fonts: ["./assets/fonts/PixelMix.ttf"],
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
        // No `microphonePermission: false` here — expo-camera's plugin unconditionally
        // *deletes* NSMicrophoneUsageDescription from the Info.plist when this is `false`,
        // via a deferred mod that runs after every plugin's static config is applied. That
        // wipes out the string expo-speech-recognition sets below regardless of array order
        // (a real build got rejected for it — ITMS-90683, missing purpose string). Camera's
        // Android RECORD_AUDIO is still opted out below; speech-recognition adds it back for
        // Android separately.
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "ThatFridge lets you attach a photo of your fridge or a receipt to a chat.",
      },
    ],
    [
      "expo-notifications",
      {
        // On-device expiry reminders (src/lib/localNotifications.ts) + remote push for
        // activity/invite notifications via Expo (src/lib/push.ts). Remote push needs the
        // aps-environment entitlement this plugin adds, so it only works from a build made
        // after this was wired up — plus an APNs key on EAS (see RELEASE.md).
      },
    ],
    // Adds the "Sign In with Apple" entitlement. The App ID (test.thatfridge.app) must have
    // that capability enabled in the Apple Developer portal — see RELEASE.md.
    "expo-apple-authentication",
    [
      // Voice dictation in Quick Chat.
      "expo-speech-recognition",
      {
        microphonePermission:
          "ThatFridge uses the microphone so you can talk to the chat instead of typing.",
        speechRecognitionPermission:
          "ThatFridge turns your speech into text for the chat.",
      },
    ],
    // Google Sign-In is only wired in once its reversed iOS OAuth client id
    // (com.googleusercontent.apps.XXXX) is set as GOOGLE_IOS_URL_SCHEME — a placeholder
    // scheme fails Apple's binary validation on submit, and google-auth.ts's guarded
    // require() already hides the button when the native module isn't in the build.
    ...(process.env.GOOGLE_IOS_URL_SCHEME
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME },
          ] as [string, Record<string, unknown>],
        ]
      : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
