"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Images, Link2, Minus, Play, Plus, Square, Trash2, Video, X } from "lucide-react";
import { RECIPE_CATEGORIES } from "@/lib/thatfridge/data";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import AttachmentLightbox from "../AttachmentLightbox";
import type { RecipeAttachment, RecipeCategory } from "@/lib/thatfridge/types";
import { theme } from "@/lib/thatfridge/theme";

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: theme.text.faint,
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${theme.border.hairline}`,
  outline: "none",
  background: theme.bg.surface2,
  borderRadius: theme.radius.sm,
  padding: "12px 14px",
  fontSize: 13.5,
  color: theme.text.primary,
  boxSizing: "border-box",
};

const VIDEO_MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function pickSupportedVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return VIDEO_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export default function RecipeFormSheet() {
  const { state, actions } = useThatFridgeCtx();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<RecipeAttachment | null>(null);
  const isEditing = !!state.recipeFormId;
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleAttachmentFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) actions.addRecipeFormAttachment(file);
    e.target.value = "";
  };

  // The <input capture> attribute is only a hint - mobile browsers are free to (and often do)
  // show the regular gallery/file chooser instead of actually launching the camera, which is
  // exactly what was happening here. Driving getUserMedia directly, the same way the barcode
  // and receipt/photo scan steps in AddScreen.tsx already do, is the only way to guarantee a
  // live camera view actually opens.
  const [cameraMode, setCameraMode] = useState<"photo" | "video" | null>(null);
  const [cameraStatus, setCameraStatus] = useState<"starting" | "ready" | "error">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!cameraMode) return;
    let cancelled = false;
    setCameraStatus("starting");
    setCameraError(null);
    setIsRecording(false);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: cameraMode === "video" })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) cameraVideoRef.current.srcObject = stream;
        setCameraStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        setCameraError(/permission|notallowed/i.test(msg) ? "Camera access was denied." : "Couldn't access the camera.");
      });

    return () => {
      cancelled = true;
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    };
  }, [cameraMode]);

  const closeCameraPanel = () => setCameraMode(null);

  const takeCameraPhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) actions.addRecipeFormAttachment(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        closeCameraPanel();
      },
      "image/jpeg",
      0.9
    );
  };

  const toggleCameraRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const mimeType = pickSupportedVideoMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType || "video/webm" });
      if (blob.size > 0) actions.addRecipeFormAttachment(new File([blob], "video.webm", { type: blob.type }));
      closeCameraPanel();
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          top: 60,
          background: theme.bg.surface,
          borderRadius: `${theme.radius.xl}px ${theme.radius.xl}px 0 0`,
          padding: "14px 22px 26px",
          animation: "pop .22s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          onClick={actions.closeRecipeForm}
          style={{ width: 36, height: 5, borderRadius: 3, background: theme.border.strong, margin: "0 auto 16px", cursor: "pointer", flex: "none" }}
        />
        <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 14, marginBottom: 18, flex: "none" }}>{isEditing ? "Edit recipe" : "New recipe"}</div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>IMPORT FROM A LINK</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={state.recipeFormLinkUrl}
                onChange={(e) => actions.onRecipeFormLinkUrlChange(e.target.value)}
                placeholder="Paste a recipe link"
                style={{ ...fieldStyle, flex: 1 }}
              />
              <div
                onClick={() => !state.recipeFormLinkImporting && actions.importRecipeFormLink()}
                style={{
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "0 16px",
                  borderRadius: theme.radius.sm,
                  background: state.recipeFormLinkUrl.trim() && !state.recipeFormLinkImporting ? theme.amber : theme.bg.surface2,
                  color: state.recipeFormLinkUrl.trim() && !state.recipeFormLinkImporting ? "#0a0a0c" : theme.text.faint,
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily: theme.fontMono,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  cursor: state.recipeFormLinkImporting ? "default" : "pointer",
                }}
              >
                <Link2 size={13} strokeWidth={2.4} />
                {state.recipeFormLinkImporting ? "Importing…" : "Import"}
              </div>
            </div>
            {state.recipeFormLinkError && (
              <div style={{ fontSize: 11.5, fontWeight: 600, color: theme.bad, marginTop: 6 }}>{state.recipeFormLinkError}</div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>NAME</div>
            <input
              autoFocus
              value={state.recipeFormName}
              onChange={(e) => actions.onRecipeFormNameChange(e.target.value)}
              placeholder="e.g. Sunday Pancakes"
              style={fieldStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>CATEGORY</div>
              <select
                value={state.recipeFormCategory ?? ""}
                onChange={(e) => actions.onRecipeFormCategoryChange((e.target.value || null) as RecipeCategory | null)}
                style={{ ...fieldStyle, appearance: "none" }}
              >
                <option value="">None</option>
                {RECIPE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ width: 110 }}>
              <div style={labelStyle}>MINUTES</div>
              <input
                type="number"
                min={1}
                max={1440}
                value={state.recipeFormMinutes}
                onChange={(e) => actions.onRecipeFormMinutesChange(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>INGREDIENTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {state.recipeFormIngredients.map((ing, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={ing.name}
                    onChange={(e) => actions.onRecipeFormIngredientNameChange(i, e.target.value)}
                    placeholder="e.g. Eggs"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <div
                    onClick={() => actions.removeRecipeFormIngredient(i)}
                    style={{ width: 34, height: 34, borderRadius: theme.radius.sm, background: theme.bg.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Minus size={15} color={theme.bad} strokeWidth={2.4} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.addRecipeFormIngredient}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: theme.blue, fontSize: 12.5, fontWeight: 700, cursor: "pointer", width: "fit-content" }}
            >
              <Plus size={14} strokeWidth={2.4} />
              Add ingredient
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={labelStyle}>STEPS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {state.recipeFormSteps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 11, background: theme.bg.surface2, color: theme.blue, fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    {i + 1}
                  </div>
                  <input
                    value={step}
                    onChange={(e) => actions.onRecipeFormStepChange(i, e.target.value)}
                    placeholder="Describe this step"
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <div
                    onClick={() => actions.removeRecipeFormStep(i)}
                    style={{ width: 34, height: 34, borderRadius: theme.radius.sm, background: theme.bg.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Minus size={15} color={theme.bad} strokeWidth={2.4} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.addRecipeFormStep}
              style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: theme.blue, fontSize: 12.5, fontWeight: 700, cursor: "pointer", width: "fit-content" }}
            >
              <Plus size={14} strokeWidth={2.4} />
              Add step
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={labelStyle}>REFERENCE PHOTOS &amp; VIDEOS</div>
            {state.recipeFormAttachments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {state.recipeFormAttachments.map((att, i) => (
                  <div
                    key={i}
                    onClick={() => setViewingAttachment(att)}
                    style={{ position: "relative", width: 64, height: 64, borderRadius: theme.radius.sm, overflow: "hidden", background: "#000", cursor: "pointer" }}
                  >
                    {att.type === "video" ? (
                      <>
                        <video src={att.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)" }}>
                          <Play size={18} color="#fff" fill="#fff" strokeWidth={0} />
                        </div>
                      </>
                    ) : (
                      <img src={att.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.removeRecipeFormAttachment(i);
                      }}
                      style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: 9, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <X size={11} color="#fff" strokeWidth={2.6} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cameraMode ? (
              <div>
                <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: theme.radius.md, overflow: "hidden", background: "#000", marginBottom: 10 }}>
                  <video ref={cameraVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div
                    onClick={closeCameraPanel}
                    style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  >
                    <X size={14} color="#fff" strokeWidth={2.4} />
                  </div>
                  {isRecording && (
                    <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.45)", padding: "3px 8px", borderRadius: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 4, background: theme.bad }} />
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#fff" }}>REC</div>
                    </div>
                  )}
                </div>
                {cameraStatus === "starting" && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.text.faint, textAlign: "center", marginBottom: 8 }}>Starting camera…</div>
                )}
                {cameraStatus === "error" && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: theme.bad, textAlign: "center", marginBottom: 8 }}>{cameraError}</div>
                )}
                {cameraStatus === "ready" && (
                  <div
                    onClick={cameraMode === "photo" ? takeCameraPhoto : toggleCameraRecording}
                    style={{
                      alignSelf: "center",
                      margin: "0 auto",
                      width: 54,
                      height: 54,
                      borderRadius: 27,
                      background: cameraMode === "video" && isRecording ? theme.bad : theme.amber,
                      border: `3px solid ${theme.border.hairline}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {cameraMode === "photo" ? (
                      <Camera size={22} color="#0a0a0c" strokeWidth={2} />
                    ) : isRecording ? (
                      <Square size={18} color="#fff" fill="#fff" strokeWidth={0} />
                    ) : (
                      <div style={{ width: 20, height: 20, borderRadius: 10, background: theme.bad }} />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div
                  onClick={() => galleryInputRef.current?.click()}
                  style={{ display: "flex", alignItems: "center", gap: 6, color: theme.blue, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  <Images size={14} strokeWidth={2.2} />
                  Add from gallery
                </div>
                <div
                  onClick={() => setCameraMode("photo")}
                  style={{ display: "flex", alignItems: "center", gap: 6, color: theme.blue, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  <Camera size={14} strokeWidth={2.2} />
                  Take photo
                </div>
                <div
                  onClick={() => setCameraMode("video")}
                  style={{ display: "flex", alignItems: "center", gap: 6, color: theme.blue, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  <Video size={14} strokeWidth={2.2} />
                  Take video
                </div>
              </div>
            )}
            {state.recipeFormAttachmentUploading && (
              <div style={{ fontSize: 11.5, fontWeight: 600, color: theme.text.faint, marginTop: 6 }}>Uploading…</div>
            )}
            <input ref={galleryInputRef} type="file" accept="image/*,video/*" onChange={handleAttachmentFile} style={{ display: "none" }} />
          </div>

          {isEditing && (
            <div style={{ marginTop: 12 }}>
              {!confirmingDelete ? (
                <div
                  onClick={() => setConfirmingDelete(true)}
                  style={{ textAlign: "center", padding: 13, borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.bad}40`, color: theme.bad, fontSize: 13.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                  Delete recipe
                </div>
              ) : (
                <div style={{ borderRadius: theme.radius.sm, padding: 14, background: theme.bg.surface2, border: `1px solid ${theme.bad}40` }}>
                  <div style={{ fontSize: 12.5, color: theme.text.muted, marginBottom: 10 }}>Delete this recipe? This can&apos;t be undone.</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div
                      onClick={() => setConfirmingDelete(false)}
                      style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: theme.radius.sm, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, color: theme.text.primary, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                    >
                      Cancel
                    </div>
                    <div
                      onClick={() => state.recipeFormId && actions.deleteCustomRecipe(state.recipeFormId)}
                      style={{ flex: 1, textAlign: "center", padding: 10, borderRadius: theme.radius.sm, background: theme.bad, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                    >
                      Yes, delete
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flex: "none" }}>
          <div
            onClick={actions.closeRecipeForm}
            style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: theme.radius.sm, background: theme.bg.surface2, border: `1px solid ${theme.border.hairline}`, color: theme.text.primary, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Cancel
          </div>
          <div
            onClick={() => actions.isRecipeFormValid() && actions.saveRecipeForm()}
            style={{
              flex: 1,
              textAlign: "center",
              padding: 13,
              borderRadius: theme.radius.sm,
              background: actions.isRecipeFormValid() ? theme.amber : theme.bg.surface2,
              color: actions.isRecipeFormValid() ? "#0a0a0c" : theme.text.faint,
              fontSize: 13.5,
              fontWeight: 700,
              fontFamily: theme.fontMono,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              cursor: "pointer",
            }}
          >
            Save
          </div>
        </div>
      </div>
      <AttachmentLightbox attachment={viewingAttachment} onClose={() => setViewingAttachment(null)} />
    </div>
  );
}
