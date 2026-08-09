"use client";

import { Refrigerator } from "lucide-react";
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
import FridgeStyleSheet from "./screens/FridgeStyleSheet";
import ItemDetailSheet from "./screens/ItemDetailSheet";
import AddScreen from "./screens/AddScreen";
import SearchScreen from "./screens/SearchScreen";
import ChatScreen from "./screens/ChatScreen";
import ChatHistoryScreen from "./screens/ChatHistoryScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import NotificationHistoryScreen from "./screens/NotificationHistoryScreen";
import AIDataScreen from "./screens/AIDataScreen";
import AboutScreen from "./screens/AboutScreen";
import AuthScreen from "./screens/AuthScreen";

function Screens() {
  const { state } = useThatFridgeCtx();
  switch (state.screen) {
    case "home":
      return <HomeScreen />;
    case "inventory":
      return <InventoryScreen />;
    case "foodHub":
      return <FoodHubScreen />;
    case "recipeDetail":
      return <RecipeDetailSheet />;
    case "recipeForm":
      return <RecipeFormSheet />;
    case "fridgeStyle":
      return <FridgeStyleSheet />;
    case "itemDetail":
      return <ItemDetailSheet />;
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
    case "about":
      return <AboutScreen />;
    default:
      return null;
  }
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
