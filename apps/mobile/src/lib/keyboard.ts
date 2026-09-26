import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * The on-screen keyboard's current height (0 when hidden), so a bottom sheet can sit ON TOP of it.
 * iOS reports it before the animation starts (`keyboardWillShow`), Android only after (`...DidShow`).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(show, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const onHide = Keyboard.addListener(hide, () => setHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);
  return height;
}
