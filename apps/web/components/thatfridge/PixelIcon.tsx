import type { IconData } from "@/lib/thatfridge/types";

export default function PixelIcon({ icon }: { icon: IconData }) {
  return (
    <div
      style={{
        display: "grid",
        position: "absolute",
        inset: 0,
        gridTemplateColumns: `repeat(${icon.cols}, 1fr)`,
        gridTemplateRows: `repeat(${icon.rows}, 1fr)`,
      }}
    >
      {icon.cells.map((hex, i) => (
        <div key={i} style={{ background: hex || "transparent" }} />
      ))}
    </div>
  );
}
