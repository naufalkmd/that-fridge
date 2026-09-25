import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/lib/theme";

const ACTION_WIDTH = 76;
const OPEN_THRESHOLD = ACTION_WIDTH * 0.6;
const SPRING = { damping: 20, stiffness: 220 } as const;

/** Horizontal swipe-to-delete wrapper - swipe left past the threshold (or tap the revealed
 *  action) to fire onDelete. Purely presentational: it doesn't remove `children` itself, the
 *  caller does that by dropping the row from whatever list it's rendering. Requires a
 *  GestureHandlerRootView ancestor, already present at the app root (see _layout.tsx). */
export function SwipeRow({
  children,
  onDelete,
  disabled,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);

  const close = useCallback(() => {
    translateX.value = withSpring(0, SPRING);
  }, [translateX]);

  const triggerDelete = useCallback(() => {
    translateX.value = withSpring(0, SPRING);
    onDelete();
  }, [onDelete, translateX]);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      "worklet";
      translateX.value = Math.min(0, Math.max(-ACTION_WIDTH * 1.4, e.translationX));
    })
    .onEnd((e) => {
      "worklet";
      if (translateX.value < -OPEN_THRESHOLD || e.velocityX < -600) {
        runOnJS(triggerDelete)();
      } else {
        runOnJS(close)();
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -translateX.value / OPEN_THRESHOLD)),
  }));

  return (
    <View style={{ overflow: "hidden" }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: ACTION_WIDTH,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.bad,
          },
          actionStyle,
        ]}
      >
        <Pressable
          onPress={triggerDelete}
          hitSlop={8}
          style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#fff" }}>Delete</Text>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: colors.canvas }, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
