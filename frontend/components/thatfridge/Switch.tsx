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
        background: on ? "#2f6fb0" : "rgba(22,50,92,0.15)",
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
          background: "#fff",
          boxShadow: "0 1px 3px rgba(22,50,92,0.3)",
          transform: on ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.15s ease",
        }}
      />
    </div>
  );
}
