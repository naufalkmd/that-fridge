import { useCallback, useRef, useState } from "react";

// Dictation for the chat composer. Uses the OS speech recognizer (iOS SFSpeechRecognizer /
// Android SpeechRecognizer) via expo-speech-recognition — no audio ever touches our servers.
// `onText` fires with the running transcript; `isFinal` marks the last one for an utterance.

export interface VoiceDictation {
  available: boolean;
  listening: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

type OnText = (transcript: string, isFinal: boolean) => void;

// expo-speech-recognition's entry point calls requireNativeModule() at import time, which
// throws on a build that predates this feature. Load it defensively so an OTA to such a
// build degrades to "voice unavailable" instead of crashing the chat screen.
let speech: typeof import("expo-speech-recognition") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speech = require("expo-speech-recognition");
} catch {
  speech = null;
}

function useVoiceDictationNative(onText: OnText): VoiceDictation {
  const mod = speech!;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = (() => {
    try {
      return mod.ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  })();

  const cb = useRef(onText);
  cb.current = onText;

  mod.useSpeechRecognitionEvent("start", () => setListening(true));
  mod.useSpeechRecognitionEvent("end", () => setListening(false));
  mod.useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript ?? "";
    if (transcript) cb.current(transcript, event.isFinal);
  });
  mod.useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    // "no-speech" (silence) and "aborted" (user cancelled) aren't worth surfacing.
    if (event.error !== "no-speech" && event.error !== "aborted") {
      setError(event.message || "Couldn't hear that — try again.");
    }
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission =
        await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError(
          "ThatFridge needs microphone and speech access for voice input.",
        );
        return;
      }
      mod.ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
      });
    } catch (e) {
      setError(
        (e as Error)?.message ?? "Voice input isn't available on this device.",
      );
    }
  }, [mod]);

  const stop = useCallback(() => {
    try {
      mod.ExpoSpeechRecognitionModule.stop();
    } catch {
      /* already stopped */
    }
  }, [mod]);

  return { available, listening, error, start, stop };
}

function useVoiceDictationUnavailable(_onText: OnText): VoiceDictation {
  return {
    available: false,
    listening: false,
    error: null,
    start: async () => {},
    stop: () => {},
  };
}

// Bound once at module load, so every caller consistently runs one implementation
// (rules-of-hooks safe — the branch never changes for the life of the app).
export const useVoiceDictation: (onText: OnText) => VoiceDictation = speech
  ? useVoiceDictationNative
  : useVoiceDictationUnavailable;
