import { Text, type TextProps, View } from "react-native";
import { Image } from "expo-image";

const logo = require("../../assets/brand/logo.svg");

/**
 * Pixel-font text — brand moments only (headers, eyebrows, the wordmark). Never body copy;
 * PixelMix is unreadable at paragraph sizes. Mirrors the web app's `--font-pixel` usage.
 */
export function PixelText({ style, ...props }: TextProps) {
  return (
    <Text
      {...props}
      style={[{ fontFamily: "PixelMix", letterSpacing: 0.5, includeFontPadding: false }, style]}
    />
  );
}

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <Image
      source={logo}
      style={{ width: size, height: size }}
      contentFit="contain"
      // logo art has its own generous viewBox padding
    />
  );
}

/** Logo + wordmark lockup used on the auth screen and headers. */
export function Wordmark({ logoSize = 40, textSize = 20 }: { logoSize?: number; textSize?: number }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Logo size={logoSize} />
      <PixelText style={{ fontSize: textSize, color: "#eaeaec" }}>ThatFridge</PixelText>
    </View>
  );
}
