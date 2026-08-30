import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated, { FadeIn } from "react-native-reanimated";

import {
  guessFoodIcon,
  type RecipeCategory,
  type RecipeSuggestionBlock,
} from "@thatfridge/core";
import { FoodIcon } from "@/components/food-icon";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const GOOD = "#39e07f";
const STRONG_BORDER = "rgba(255,255,255,0.18)";

type Style = {
  color: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const CATEGORY_STYLE: Record<RecipeCategory, Style> = {
  breakfast: { color: "#f5a623", label: "Breakfast", icon: "food-croissant" },
  lunch: { color: "#39e07f", label: "Lunch", icon: "hamburger" },
  dinner: { color: "#3d6fe0", label: "Dinner", icon: "silverware-fork-knife" },
  dessert: { color: "#ff5f56", label: "Dessert", icon: "cupcake" },
  snack: { color: "#7a5cb0", label: "Snack", icon: "popcorn" },
  quick: { color: "#b5702f", label: "Quick meal", icon: "lightning-bolt" },
};
const DEFAULT_STYLE: Style = {
  color: "#5b8dee",
  label: "Recipe",
  icon: "silverware-variant",
};

const CARD_W = 264;

export function RecipeSuggestionCard({
  suggestion,
  added,
  adding,
  onAdd,
  onDismiss,
}: {
  suggestion: RecipeSuggestionBlock;
  added: boolean;
  adding: boolean;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const style =
    (suggestion.category && CATEGORY_STYLE[suggestion.category]) ||
    DEFAULT_STYLE;
  const icon =
    guessFoodIcon(suggestion.ingredients[0]?.name ?? "") ?? "leftovers";

  if (dismissed) return null;

  return (
    <View style={{ marginTop: 8, alignItems: "flex-start", gap: 8 }}>
      {/* chunky pixel frame: colored border wrapping a surface card */}
      <View
        style={{
          width: CARD_W,
          backgroundColor: style.color,
          borderRadius: 6,
          padding: 4,
        }}
      >
        <View
          style={{
            backgroundColor: SURFACE,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <View
            style={{
              backgroundColor: style.color,
              paddingHorizontal: 10,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: "800",
                color: "#0a0a0c",
                lineHeight: 16,
              }}
            >
              {suggestion.name}
            </Text>
            <View
              style={{
                backgroundColor: "rgba(10,10,12,0.22)",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text
                style={{ fontSize: 10.5, fontWeight: "800", color: "#0a0a0c" }}
              >
                {suggestion.minutes}m
              </Text>
            </View>
          </View>

          {/* framed pixel art */}
          <View
            style={{
              margin: 10,
              height: 92,
              backgroundColor: SURFACE2,
              borderWidth: 3,
              borderColor: style.color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FoodIcon icon={icon} name={suggestion.name} size={60} />
          </View>

          {/* category badge */}
          <View style={{ alignItems: "center", marginBottom: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: style.color,
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderRadius: 9,
              }}
            >
              <MaterialCommunityIcons
                name={style.icon}
                size={11}
                color="#0a0a0c"
              />
              <Text
                style={{
                  fontSize: 9.5,
                  fontWeight: "800",
                  letterSpacing: 0.4,
                  color: "#0a0a0c",
                }}
              >
                {style.label.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* ingredients — all shown, no inner scroll */}
          <View style={{ paddingHorizontal: 12, gap: 4 }}>
            <Text
              style={{
                fontSize: 8.5,
                fontWeight: "800",
                letterSpacing: 0.5,
                color: style.color,
              }}
            >
              INGREDIENTS
            </Text>
            {suggestion.ingredients.map((ing, i) => (
              <View
                key={i}
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <View
                  style={{ width: 4, height: 4, backgroundColor: style.color }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    lineHeight: 16,
                    color: INK,
                  }}
                >
                  {ing.name}
                </Text>
              </View>
            ))}
          </View>

          {/* steps — expanded inline on tap */}
          {showSteps && (
            <Animated.View
              entering={FadeIn.duration(160)}
              style={{ paddingHorizontal: 12, marginTop: 12, gap: 8 }}
            >
              <Text
                style={{
                  fontSize: 8.5,
                  fontWeight: "800",
                  letterSpacing: 0.5,
                  color: style.color,
                }}
              >
                STEPS
              </Text>
              {suggestion.steps.map((step, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      backgroundColor: style.color,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "800",
                        color: "#0a0a0c",
                      }}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 11.5,
                      lineHeight: 17,
                      color: INK,
                    }}
                  >
                    {step}
                  </Text>
                </View>
              ))}
            </Animated.View>
          )}

          {/* description + expand toggle */}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: `${style.color}44`,
              marginTop: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                fontSize: 10.5,
                fontStyle: "italic",
                lineHeight: 15,
                color: MUTED,
              }}
            >
              {suggestion.description || "A tasty pick from your fridge."}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowSteps((s) => !s)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingVertical: 9,
            }}
          >
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "800",
                letterSpacing: 0.4,
                color: style.color,
              }}
            >
              {showSteps
                ? "HIDE STEPS"
                : `SHOW STEPS (${suggestion.steps.length})`}
            </Text>
            <MaterialCommunityIcons
              name={showSteps ? "chevron-up" : "chevron-down"}
              size={13}
              color={style.color}
            />
          </Pressable>
        </View>
      </View>

      {/* actions */}
      {added ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 2,
          }}
        >
          <MaterialCommunityIcons name="check" size={14} color={GOOD} />
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: GOOD }}>
            Added to your recipe book
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, width: CARD_W }}>
          <Pressable
            onPress={adding ? undefined : onAdd}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 10,
              borderRadius: 6,
              backgroundColor: adding ? SURFACE2 : style.color,
              opacity: adding ? 0.7 : 1,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: adding ? MUTED : "#0a0a0c",
              }}
            >
              {adding ? "Adding…" : "Add to recipe book"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setDismissed(true);
              onDismiss();
            }}
            style={{
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: STRONG_BORDER,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 12, fontWeight: "700", color: INK }}
            >
              No thanks
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
