import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

// "Let Organizer move items for you": whether activating Organizer also checks where your items are stored. Kept on this
// device on its own - it is NOT the shared-fridge "Crew activity" notification setting it was once mistakenly wired to.
const KEY = "thatfridge_organizer_auto_v1";

export function useOrganizerAuto(): { auto: boolean; setAuto: (on: boolean) => void } {
  const [auto, setAutoState] = useState(false);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(KEY)
      .then((v) => alive && setAutoState(v === "1"))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    SecureStore.setItemAsync(KEY, on ? "1" : "0").catch(() => {});
  }, []);

  return { auto, setAuto };
}
