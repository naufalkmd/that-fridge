"use client";

import { useState } from "react";
import { Refrigerator } from "lucide-react";
import type { Screen } from "@/lib/thatfridge/types";
import { ThatFridgeProvider, useThatFridgeCtx } from "./ThatFridgeContext";
import TabBar from "./TabBar";
import Sidebar from "./Sidebar";
import ProfileDrawer from "./ProfileDrawer";
import UndoToast from "./UndoToast";
import SyncErrorToast from "./SyncErrorToast";
import HomeScreen from "./screens/HomeScreen";
import InventoryScreen from "./screens/InventoryScreen";
import FoodHubScreen from "./screens/FoodHubScreen";
import RecipeDetailSheet from "./screens/RecipeDetailSheet";
import RecipeFormSheet from "./screens/RecipeFormSheet";
import MarkRecipeMadeSheet from "./screens/MarkRecipeMadeSheet";
import FridgeStyleSheet from "./screens/FridgeStyleSheet";
import ItemDetailSheet from "./screens/ItemDetailSheet";
import AddScreen from "./screens/AddScreen";
import SearchScreen from "./screens/SearchScreen";
import ChatScreen from "./screens/ChatScreen";
import ChatHistoryScreen from "./screens/ChatHistoryScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import NotificationHistoryScreen from "./screens/NotificationHistoryScreen";
import AIDataScreen from "./screens/AIDataScreen";
import GoalsScreen from "./screens/GoalsScreen";
import AboutScreen from "./screens/AboutScreen";
import AuthScreen from "./screens/AuthScreen";

// These four render as a dimmed backdrop + slide-up sheet on top of whatever was already on
// screen (see each file's `rgba(22,50,92,0.32)` backdrop), not as a full replacement screen.
const SHEET_SCREENS = new Set<Screen>(["itemDetail", "fridgeStyle", "recipeDetail", "recipeForm"]);

function BaseScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case "home":
      return <HomeScreen />;
    case "inventory":
      return <InventoryScreen />;
    case "foodHub":
      return <FoodHubScreen />;
    case "add":
      return <AddScreen />;
    case "search":
      return <SearchScreen />;
    case "chat":
      return <ChatScreen />;
    case "chatHistory":
      return <ChatHistoryScreen />;
    case "notifications":
      return <NotificationsScreen />;
    case "notificationHistory":
      return <NotificationHistoryScreen />;
    case "aiData":
      return <AIDataScreen />;
    case "goals":
      return <GoalsScreen />;
    case "about":
      return <AboutScreen />;
    default:
      return null;
  }
}

function Screens() {
  const { state } = useThatFridgeCtx();
  // A sheet (edit item / edit fridge / recipe detail / recipe form) has no full screen of its
  // own - it opens over whatever screen was already showing, dimmed behind it. state.screen
  // switches exclusively to the sheet's own value while it's open, so the base screen has to
  // be remembered separately rather than read straight off state.screen, or it would unmount
  // and leave the backdrop over blank space instead of the real screen underneath. This is
  // React's documented "adjusting state during render" pattern (comparing against the last-seen
  // prop and calling setState directly in the render body) rather than a ref, since refs can't
  // be read or written during render.
  const [prevScreen, setPrevScreen] = useState(state.screen);
  const [baseScreen, setBaseScreen] = useState<Screen>(SHEET_SCREENS.has(state.screen) ? "home" : state.screen);
  if (state.screen !== prevScreen) {
    setPrevScreen(state.screen);
    if (!SHEET_SCREENS.has(state.screen)) {
      setBaseScreen(state.screen);
    }
  }

  return (
    <>
      <BaseScreen screen={baseScreen} />
      {state.screen === "itemDetail" && <ItemDetailSheet />}
      {state.screen === "fridgeStyle" && <FridgeStyleSheet />}
      {state.screen === "recipeDetail" && <RecipeDetailSheet />}
      {state.screen === "recipeForm" && <RecipeFormSheet />}
      {/* Not screen-driven like the sheets above - overlays on top of whichever screen opened
          it (always recipeDetail today) via its own markMadeRecipeId state, so it needs to be
          unconditionally mounted here rather than added to SHEET_SCREENS. */}
      <MarkRecipeMadeSheet />
    </>
  );
}

const shellStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: 480,
  margin: "0 auto",
  overflow: "hidden",
  background: "linear-gradient(180deg,#eaf6ff,#cfe8fb 55%,#eaf6ff)",
  fontFamily: "-apple-system, system-ui, sans-serif",
  color: "#16325c",
};

function AppShell() {
  const { state } = useThatFridgeCtx();

  if (!state.isAuthenticated) {
    return (
      <div className="thatfridge-shell thatfridge-auth-shell" style={shellStyle}>
        <AuthScreen />
      </div>
    );
  }

  if (state.isLoading) {
    return (
      <div
        className="thatfridge-shell thatfridge-auth-shell"
        style={{ ...shellStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 14, fontWeight: 600 }}
      >
        <Refrigerator size={20} color="#16325c" strokeWidth={1.8} />
        Loading your fridge…
      </div>
    );
  }

  // Signed in: below 900px this renders as plain full-bleed mobile (same as a real phone,
  // no framed-preview tier); at >=900px CSS swaps it for Sidebar + a full-width shell — see
  // the .thatfridge-app-wrap rules in globals.css.
  //
  // Every screen fills the shell edge-to-edge at any width (no boxed/framed card). Screens
  // whose content would otherwise stretch unreadably wide or pin to the top-left give their
  // own content areas a .thatfridge-wide-content wrapper (max-width + centered) instead of
  // the whole screen being capped — see each screen file and the >=900px rules in globals.css.
  return (
    <div className="thatfridge-app-wrap">
      <Sidebar />
      <div className="thatfridge-shell" style={shellStyle}>
        <Screens />
        <UndoToast />
        <SyncErrorToast />
        <TabBar />
        <ProfileDrawer />
      </div>
    </div>
  );
}

export default function ThatFridgeApp() {
  return (
    <ThatFridgeProvider>
      <AppShell />
    </ThatFridgeProvider>
  );
}
