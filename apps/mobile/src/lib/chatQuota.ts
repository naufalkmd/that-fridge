import * as SecureStore from "expo-secure-store";

// Free-tier gate for AI chat: N messages per ISO week. v1 is a client-side counter —
// good enough to make the paywall real and visible for launch. Move server-side
// (enforced in AgentController) post-launch so it can't be reset by clearing app data.

export const FREE_CHATS_PER_WEEK = 5;

const KEY = "thatfridge_chat_quota";

function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

export async function getChatUsed(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { week: string; used: number };
    return parsed.week === isoWeek() ? parsed.used : 0;
  } catch {
    return 0;
  }
}

export async function bumpChatUsed(): Promise<void> {
  try {
    const used = (await getChatUsed()) + 1;
    await SecureStore.setItemAsync(KEY, JSON.stringify({ week: isoWeek(), used }));
  } catch {
    /* noop */
  }
}
