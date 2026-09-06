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

// OAuth client ids — see apps/mobile/RELEASE.md. The web id is what the ID token's `aud`
// carries (backend verifies against it); the iOS id is what the native SDK needs to resolve
// its own client at configure() time (without it, iOS throws "iosClientId was not provided").
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

if (g && WEB_CLIENT_ID) {
  g.GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
  });
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
