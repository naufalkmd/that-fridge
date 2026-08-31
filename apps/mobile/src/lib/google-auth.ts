// @react-native-google-signin loads its native module with TurboModuleRegistry.getEnforcing,
// which throws at import on a build that predates this feature. Load it through require() so
// an OTA to such a build just hides the Google button instead of crashing at startup.

let g: typeof import("@react-native-google-signin/google-signin") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  g = require("@react-native-google-signin/google-signin");
} catch {
  g = null;
}

// The Web OAuth client id — see apps/mobile/RELEASE.md. Both the native module and the
// backend verify against it.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

if (g && WEB_CLIENT_ID) {
  g.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
}

export const googleAuthAvailable = !!g && !!WEB_CLIENT_ID;

/** Runs the native Google Sign-In flow; returns the ID token, or null if the user cancelled. */
export async function googleSignInIdToken(): Promise<string | null> {
  if (!g) throw new Error("Google Sign-In isn't available in this build.");
  await g.GoogleSignin.hasPlayServices();
  const res = await g.GoogleSignin.signIn();
  if (!g.isSuccessResponse(res)) return null;
  return res.data.idToken ?? null;
}

export async function googleSignOut(): Promise<void> {
  try {
    await g?.GoogleSignin.signOut();
  } catch {
    /* not signed in with Google, or module absent */
  }
}
