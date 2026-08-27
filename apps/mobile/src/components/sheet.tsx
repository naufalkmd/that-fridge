import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { PixelText } from "@/components/brand";

/**
 * Header for a modal-presented screen so it reads as a bottom sheet: a grab handle,
 * a pixel title, and a close affordance. The screen is still a real route — this is
 * just the chrome. Pass `onBack` to show a back chevron (for multi-step sheets).
 */
export function SheetHeader({
  title,
  onClose,
  onBack,
}: {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const close = onClose ?? (() => router.back());
  return (
    <View className="items-center px-5 pb-2 pt-2.5">
      <View className="mb-3 h-1 w-9 rounded-full bg-hairline-strong" />
      <View className="w-full flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {onBack && (
            <Pressable onPress={onBack} hitSlop={10}>
              <Ionicons name="chevron-back" size={18} color="rgba(234,234,236,0.58)" />
            </Pressable>
          )}
          <PixelText style={{ fontSize: 13, color: "#eaeaec" }}>{title}</PixelText>
        </View>
        <Pressable onPress={close} hitSlop={10}>
          <Text className="text-[15px] text-muted">✕</Text>
        </Pressable>
      </View>
    </View>
  );
}
