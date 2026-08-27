import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { PixelText } from "@/components/brand";

/**
 * Header for a modal-presented screen so it reads as a bottom sheet: a grab handle,
 * a pixel title, and a close affordance. The screen is still a real route — this is
 * just the chrome.
 */
export function SheetHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  const router = useRouter();
  const close = onClose ?? (() => router.back());
  return (
    <View className="items-center px-5 pb-2 pt-2.5">
      <View className="mb-3 h-1 w-9 rounded-full bg-hairline-strong" />
      <View className="w-full flex-row items-center justify-between">
        <PixelText style={{ fontSize: 13, color: "#eaeaec" }}>{title}</PixelText>
        <Pressable onPress={close} hitSlop={10}>
          <Text className="text-[15px] text-muted">✕</Text>
        </Pressable>
      </View>
    </View>
  );
}
