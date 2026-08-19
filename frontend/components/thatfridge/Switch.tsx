import { theme } from "@/lib/thatfridge/theme";

export default function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: on ? theme.blue : theme.bg.surface2,
        padding: 3,
        cursor: "pointer",
        flex: "none",
        transition: "background 0.15s ease",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          background: theme.text.primary,
          border: `1px solid ${theme.border.hairline}`,
          transform: on ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.15s ease",
        }}
      />
    </div>
  );
}
