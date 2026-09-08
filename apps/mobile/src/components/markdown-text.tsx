import { Text, View, type TextStyle } from "react-native";

// Lightweight stand-in for the web's react-markdown renderer — handles the small subset the
// agents actually emit: **bold**, `#`/`##`/`###` headings, and `-`/`*`/`1.` list items.

const BOLD = /(\*\*[^*]+\*\*)/g;

function inline(text: string, key: string, color: string, selectable: boolean) {
  const parts = text.split(BOLD);
  return (
    <Text key={key} selectable={selectable} style={{ color }}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <Text key={i} style={{ fontWeight: "800" }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

export function MarkdownText({
  text,
  color = "#eaeaec",
  size = 13.5,
  selectable = false,
}: {
  text: string;
  color?: string;
  size?: number;
  /** Long-press to select / copy. Off by default to match the rest of the app. */
  selectable?: boolean;
}) {
  const base: TextStyle = { fontSize: size, lineHeight: size * 1.5, color };
  const lines = text.split("\n");

  return (
    <View>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 6 }} />;

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          return (
            <Text
              key={i}
              selectable={selectable}
              style={{ ...base, fontWeight: "800", marginBottom: 4 }}
            >
              {heading[2]}
            </Text>
          );
        }

        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={{ flexDirection: "row", marginVertical: 1 }}>
              <Text style={{ ...base }}>{"•  "}</Text>
              <View style={{ flex: 1 }}>
                {inline(bullet[1], `${i}`, color, selectable)}
              </View>
            </View>
          );
        }

        const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (numbered) {
          return (
            <View key={i} style={{ flexDirection: "row", marginVertical: 1 }}>
              <Text style={{ ...base }}>{`${numbered[1]}.  `}</Text>
              <View style={{ flex: 1 }}>
                {inline(numbered[2], `${i}`, color, selectable)}
              </View>
            </View>
          );
        }

        return (
          <Text key={i} selectable={selectable} style={base}>
            {inline(line, `${i}`, color, selectable)}
          </Text>
        );
      })}
    </View>
  );
}
