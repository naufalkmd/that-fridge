import { Text, View, type ViewProps } from "react-native";

import { PixelText } from "@/components/brand";

/** Pixel-font section header — mirrors the web's "Overview" / "Your crew" headers. */
export function SectionHeader({ children }: { children: string }) {
  return (
    <PixelText style={{ fontSize: 13, color: "#eaeaec", marginBottom: 11 }}>{children}</PixelText>
  );
}

/** Tiny uppercase label — the web's "EXPIRING SOON" / "LOW STOCK" eyebrows. */
export function Eyebrow({ children, color = "#eaeaec" }: { children: string; color?: string }) {
  return (
    <Text
      style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color }}
      className="uppercase"
    >
      {children}
    </Text>
  );
}

const AGENT_COLOR: Record<string, string> = {
  Guardian: "#ff5f56",
  Shopkeeper: "#39e07f",
  Chef: "#f5a623",
  Organizer: "#3d6fe0",
};

/** Agent identity pill — "GUARDIAN" etc, tinted with the agent colour. */
export function AgentBadge({ name }: { name: keyof typeof AGENT_COLOR | string }) {
  const color = AGENT_COLOR[name] ?? "#eaeaec";
  return (
    <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${color}1a` }}>
      <Text
        style={{ fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3, color }}
        className="uppercase"
      >
        {name}
      </Text>
    </View>
  );
}

/** Standard surface card — hairline border, no shadow (per the web migration map). */
export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View className={`rounded-xl border border-hairline bg-surface ${className}`} {...props} />
  );
}
