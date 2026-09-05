import { useEffect } from "react";
import { Modal, Pressable, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";

// Drag the handle down past this far, or flick it fast enough, and it counts as a dismiss.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

/**
 * A bottom sheet with a draggable grab handle, backed by a real RN <Modal> (so it renders
 * above everything, tab bar included) rather than a route - use this for in-screen pickers
 * like "move to category" or a date picker, not full navigation screens (those already get
 * native swipe-to-dismiss for free from expo-router's `presentation: "modal"`).
 *
 * The gesture only lives on the handle, not the whole sheet, so a ScrollView/list inside
 * `children` keeps scrolling normally instead of fighting the drag for the same pan gesture.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeight,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: number;
}) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  const drag = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const containerStyle: ViewStyle = {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 34,
    maxHeight,
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.55)",
        }}
      >
        <Animated.View style={[containerStyle, sheetStyle]}>
          {/* Swallows touches so tapping anywhere in the sheet (not just `children`) doesn't
              bubble to the backdrop Pressable above and close it. */}
          <Pressable onPress={() => {}}>
            <GestureDetector gesture={drag}>
              <View
                style={{
                  paddingTop: 10,
                  paddingBottom: 8,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: HAIRLINE,
                  }}
                />
              </View>
            </GestureDetector>
            <View style={{ paddingHorizontal: 16 }}>{children}</View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
