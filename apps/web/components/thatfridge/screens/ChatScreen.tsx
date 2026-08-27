"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronLeft, History, Mic, Paperclip, Square, SquarePen, X } from "lucide-react";
import type { RecipeSuggestion } from "@/lib/thatfridge/types";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import MarkdownText from "../MarkdownText";
import RecipePixelCard from "../RecipePixelCard";

function RecipeSuggestionCard({ suggestion }: { suggestion: RecipeSuggestion }) {
  const { state, actions } = useThatFridgeCtx();
  const [dismissed, setDismissed] = useState(false);
  // Chat history (and its recipe cards) is restored fresh on every reload, so "already added"
  // can't live in this component's local state alone - it'd forget and let the same card
  // create a duplicate recipe on a second click after a refresh. Deriving it from whether a
  // matching recipe already exists (same pattern RecipeDetailSheet uses for "on shopping
  // list") makes it survive reloads for free.
  const alreadyAdded = state.recipes.some((r) => r.name.trim().toLowerCase() === suggestion.name.trim().toLowerCase());
  const [adding, setAdding] = useState(false);
  const status = dismissed ? "dismissed" : adding ? "adding" : alreadyAdded ? "added" : "idle";

  if (status === "dismissed") return null;

  const handleAdd = async () => {
    setAdding(true);
    await actions.addSuggestedRecipeToLibrary(suggestion);
    setAdding(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <RecipePixelCard suggestion={suggestion} />
      {status === "added" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: theme.good }}>
          <Check size={14} strokeWidth={2.4} />
          Added to your recipe book
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 220 }}>
          <div
            onClick={handleAdd}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "9px 10px",
              borderRadius: theme.radius.sm,
              background: status === "adding" ? theme.bg.surface2 : theme.amber,
              color: status === "adding" ? theme.text.faint : "#0a0a0c",
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: theme.fontMono,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              cursor: status === "adding" ? "default" : "pointer",
            }}
          >
            {status === "adding" ? "Adding…" : "Add to recipe book"}
          </div>
          <div
            onClick={() => status !== "adding" && setDismissed(true)}
            style={{
              flex: "none",
              textAlign: "center",
              padding: "9px 14px",
              borderRadius: theme.radius.sm,
              background: "transparent",
              border: `1px solid ${theme.border.strong}`,
              color: theme.text.primary,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            No thanks
          </div>
        </div>
      )}
    </div>
  );
}

const QUICK_ASKS = ["What's expiring soon?", "What can I cook tonight?", "What do I need to buy?", "How's my fridge doing?"];

interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike } };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
interface SpeechWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return undefined;
  const w = window as SpeechWindow;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export default function ChatScreen() {
  const { state, actions, chatScrollRef } = useThatFridgeCtx();
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported] = useState(() => !!getSpeechRecognitionCtor());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const draftRef = useRef(state.chatDraft);

  useEffect(() => {
    draftRef.current = state.chatDraft;
  }, [state.chatDraft]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [state.chatMessages, state.isTyping, chatScrollRef]);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        actions.onDraftChange(draftRef.current ? `${draftRef.current} ${transcript}` : transcript);
      }
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showQuickAsks = state.chatMessages.length <= 3;

  const toggleVoice = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
    } else {
      setIsListening(true);
      recognition.start();
    }
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachmentFile(file);
      setAttachmentPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    }
    e.target.value = "";
  };

  const clearAttachment = () => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    setAttachmentFile(null);
    setAttachmentPreviewUrl(null);
  };

  const handleSend = () => {
    actions.sendMessage(attachmentFile ?? undefined);
    // sendMessage/sendChat creates its own object URL for the sent bubble - this one (the
    // composer preview) is no longer needed once send fires.
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
    setAttachmentFile(null);
    setAttachmentPreviewUrl(null);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url(/images/thatfridge/chat-wallpaper.png), linear-gradient(180deg, ${theme.bg.canvas}, ${theme.bg.canvas})`,
        backgroundRepeat: "repeat, no-repeat",
        backgroundSize: "400px 400px, auto",
        imageRendering: "pixelated",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: "none", padding: "28px 0 14px", background: "rgba(19,19,22,0.75)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${theme.border.hairline}` }}>
        <div className="thatfridge-wide-content thatfridge-wide-content--chat" style={{ padding: "0 20px", display: "flex", alignItems: "center", gap: 10, boxSizing: "border-box" }}>
          <div onClick={actions.goHome} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}>
            <ChevronLeft size={20} color={theme.text.primary} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: theme.text.primary }}>Quick Chat</div>
            <div style={{ fontSize: 11.5, color: theme.text.faint }}>Quick answers about your fridge</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              onClick={actions.openChatHistory}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: theme.bg.surface2,
                border: `1px solid ${theme.border.hairline}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flex: "none",
              }}
            >
              <History size={15} color={theme.text.primary} strokeWidth={2} />
            </div>
            <div
              onClick={actions.startNewChat}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                background: theme.bg.surface2,
                border: `1px solid ${theme.border.hairline}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flex: "none",
              }}
            >
              <SquarePen size={15} color={theme.text.primary} strokeWidth={2} />
            </div>
          </div>
        </div>
      </div>

      <div ref={chatScrollRef} className="thatfridge-wide-content thatfridge-wide-content--chat" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 12, boxSizing: "border-box" }}>
        {state.chatMessages.map((m) => (
          <Fragment key={m.id}>
            {(m.from === "user" || m.text) && (
              <div style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start", animation: "pop .18s ease-out" }}>
                {m.from === "bot" ? (
                  <div style={{ maxWidth: "82%", background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: "4px 16px 16px 16px", padding: "11px 14px" }}>
                    {m.mocked && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.text.faint, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        Demo reply — no AI key configured
                      </div>
                    )}
                    {m.text && <MarkdownText text={m.text} />}
                  </div>
                ) : (
                  <div style={{ maxWidth: "78%", background: theme.amber, color: "#0a0a0c", borderRadius: "16px 4px 16px 16px", padding: m.attachmentUrl ? 6 : "11px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
                    {m.attachmentUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob: URL, next/image can't optimize it
                      <img
                        src={m.attachmentUrl}
                        alt={m.attachmentName || "Attached photo"}
                        style={{ display: "block", width: "100%", maxWidth: 220, borderRadius: 10, marginBottom: m.text ? 8 : 0 }}
                      />
                    )}
                    {m.text && <div style={{ padding: m.attachmentUrl ? "0 8px 5px" : 0 }}>{m.text}</div>}
                  </div>
                )}
              </div>
            )}
            {m.suggestedRecipe && (
              <div style={{ display: "flex", justifyContent: "flex-start", animation: "pop .18s ease-out" }}>
                <RecipeSuggestionCard suggestion={m.suggestedRecipe} />
              </div>
            )}
          </Fragment>
        ))}

        {state.isTyping && (
          <div style={{ maxWidth: "82%", background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: "4px 16px 16px 16px", padding: "13px 16px", display: "flex", gap: 4, alignItems: "center" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: theme.text.faint, animation: "bounce 1.1s ease-in-out infinite" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: theme.text.faint, animation: "bounce 1.1s ease-in-out infinite .15s" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: theme.text.faint, animation: "bounce 1.1s ease-in-out infinite .3s" }} />
          </div>
        )}
      </div>

      {showQuickAsks && (
        <div className="thatfridge-wide-content thatfridge-wide-content--chat" style={{ flex: "none", padding: "0 16px 10px", display: "flex", gap: 8, overflowX: "auto", boxSizing: "border-box" }}>
          {QUICK_ASKS.map((label) => (
            <div
              key={label}
              onClick={() => actions.askQuick(label)}
              style={{ flex: "none", whiteSpace: "nowrap", background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.sm, padding: "8px 13px", fontSize: 12, fontWeight: 600, color: theme.text.primary, cursor: "pointer" }}
            >
              {label}
            </div>
          ))}
        </div>
      )}

      <div className="thatfridge-chat-footer" style={{ flex: "none", padding: "8px 0 80px", background: "rgba(19,19,22,0.85)", backdropFilter: "blur(12px)", borderTop: `1px solid ${theme.border.hairline}` }}>
        <div className="thatfridge-wide-content thatfridge-wide-content--chat" style={{ padding: "0 14px", boxSizing: "border-box" }}>
          {attachmentPreviewUrl && (
            <div style={{ position: "relative", width: 56, height: 56, marginBottom: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, next/image can't optimize it */}
              <img src={attachmentPreviewUrl} alt={attachmentFile?.name || "Attached photo"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: theme.radius.sm, border: `1px solid ${theme.border.hairline}` }} />
              <div
                onClick={clearAttachment}
                style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, background: theme.bg.canvas, border: `1px solid ${theme.border.strong}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <X size={11} color={theme.text.primary} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChosen} style={{ display: "none" }} />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ width: 38, height: 38, borderRadius: 19, background: theme.bg.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
            >
              <Paperclip size={16} color={theme.text.primary} strokeWidth={2.2} />
            </div>
            <input
              value={state.chatDraft}
              onChange={(e) => actions.onDraftChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={isListening ? "Listening…" : "Ask about your fridge…"}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: theme.bg.surface2, borderRadius: 20, padding: "11px 16px", fontSize: 13.5, color: theme.text.primary }}
            />
            {voiceSupported && (
              <div
                onClick={toggleVoice}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  background: isListening ? theme.bad : theme.bg.surface2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flex: "none",
                  animation: isListening ? "micPulse 1.4s ease-in-out infinite" : "none",
                }}
              >
                {isListening ? <Square size={13} color={theme.text.primary} fill={theme.text.primary} /> : <Mic size={16} color={theme.text.primary} strokeWidth={2.2} />}
              </div>
            )}
            <div onClick={handleSend} style={{ width: 38, height: 38, borderRadius: 19, background: theme.amber, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}>
              <ArrowUp size={17} color="#0a0a0c" strokeWidth={2.3} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
