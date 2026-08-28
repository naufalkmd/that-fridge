import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Full-screen viewer for a recipe reference photo — the thumbnail grid in the recipe detail /
 * form is too small to actually look at. Ports apps/web's AttachmentLightbox (image case;
 * videos still open in the system player, no video lib bundled).
 */
export default function AttachmentLightbox() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: "rgba(6,12,22,0.97)" }}>
      <Pressable style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }} onPress={() => router.back()}>
        <Image source={{ uri: url }} style={{ width: "100%", height: "80%" }} contentFit="contain" />
      </Pressable>
      <SafeAreaView style={{ position: "absolute", top: 0, right: 0 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ margin: 16, padding: 8, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
