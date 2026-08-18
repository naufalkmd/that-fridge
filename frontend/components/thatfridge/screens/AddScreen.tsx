"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Keyboard, Minus, Plus, Receipt, Refrigerator, ScanBarcode, Sparkles, X } from "lucide-react";
import { FOOD_ICON_KEYS, ICON_LABELS, NUTRITION_CATEGORIES, STORAGE_LOCATIONS } from "@/lib/thatfridge/data";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";
import LocationIcon from "../LocationIcon";
import type { ProduceCondition, ScanMethod, StorageLocation } from "@/lib/thatfridge/types";

const SCAN_METHODS: { key: ScanMethod; title: string; desc: string; Icon: typeof Receipt }[] = [
  { key: "receipt", title: "Scan receipt", desc: "Snap your grocery receipt", Icon: Receipt },
  { key: "barcode", title: "Scan barcode", desc: "Point your camera at a product barcode", Icon: ScanBarcode },
  { key: "photo", title: "Photo of fridge", desc: "Let AI spot what changed", Icon: Camera },
  { key: "manual", title: "Add manually", desc: "Type in the item yourself", Icon: Keyboard },
];

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "#fff",
  boxShadow: "0 6px 16px rgba(22,50,92,0.06)",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13.5,
  color: "#16325c",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: "rgba(22,50,92,0.5)",
  marginBottom: 6,
};

const AUTO_FILL_COLOR = "#7a5cc9";

const PRODUCE_CONDITIONS: { key: ProduceCondition; label: string }[] = [
  { key: "vibrant", label: "Still vibrant" },
  { key: "wilting", label: "Starting to wilt" },
  { key: "past_best", label: "Past its best" },
];

function AutoFillButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <div
      onClick={loading ? undefined : onClick}
      title="Ask the AI to suggest an expiry date and storage location"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 10px",
        borderRadius: 10,
        background: `${AUTO_FILL_COLOR}1a`,
        color: AUTO_FILL_COLOR,
        fontSize: 11.5,
        fontWeight: 700,
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.6 : 1,
        flex: "none",
      }}
    >
      <Sparkles size={13} strokeWidth={2.2} />
      {loading ? "Thinking…" : "Auto-fill"}
    </div>
  );
}

const SCAN_EXPIRY_COLOR = "#2f6fb0";

// Sits next to AutoFillButton wherever it appears - reading the real printed date off the
// package is strictly more accurate than guessing from the item's name alone, so both are
// offered as equally-reachable one-tap options rather than only ever guessing.
function ScanExpiryButton({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      title="Scan the printed expiry date instead of guessing"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        padding: "0 8px",
        borderRadius: 10,
        background: `${SCAN_EXPIRY_COLOR}1a`,
        color: SCAN_EXPIRY_COLOR,
        cursor: "pointer",
        flex: "none",
      }}
    >
      <Camera size={13} strokeWidth={2.2} />
    </div>
  );
}

function LocationPicker({ value, onChange }: { value: StorageLocation; onChange: (loc: StorageLocation) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, flex: "none" }}>
      {STORAGE_LOCATIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <div
            key={opt.key}
            onClick={() => onChange(opt.key)}
            title={opt.label}
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: active ? opt.color : "#eaf6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <LocationIcon location={opt.key} size={13} color={active ? "#fff" : "rgba(22,50,92,0.4)"} />
          </div>
        );
      })}
    </div>
  );
}

export default function AddScreen() {
  const { state, actions } = useThatFridgeCtx();
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconPickerForId, setIconPickerForId] = useState<string | null>(null);
  const expiryFileInputRef = useRef<HTMLInputElement | null>(null);
  const scanningLabel = state.scanMethod === "receipt" ? "Reading receipt…" : "Scanning fridge photo…";
  const checkedCount = state.detected.filter((d) => d.checked).length;
  const targetFridge = state.fridges[state.addFridgeIndex];
  const sections = targetFridge?.sections || [];

  // Expiry-date capture: live camera preview + shutter (primary), photo upload (secondary),
  // skip-to-manual (fallback, jumps straight to the already-editable date field on the review
  // screen). Unlike barcode decoding (local, free, every frame), reading the date is a paid AI
  // vision call, so we capture one still frame on tap rather than scanning continuously.
  const [expiryCameraStatus, setExpiryCameraStatus] = useState<"starting" | "ready" | "error">("starting");
  const [expiryCameraError, setExpiryCameraError] = useState<string | null>(null);
  const expiryVideoRef = useRef<HTMLVideoElement | null>(null);
  const expiryStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (state.addStep !== 6) return;
    let cancelled = false;
    setExpiryCameraStatus("starting");
    setExpiryCameraError(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        expiryStreamRef.current = stream;
        if (expiryVideoRef.current) expiryVideoRef.current.srcObject = stream;
        setExpiryCameraStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setExpiryCameraStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        setExpiryCameraError(
          /permission|notallowed/i.test(msg)
            ? "Camera access was denied — use the options below instead."
            : "Couldn't access the camera — use the options below instead."
        );
      });

    return () => {
      cancelled = true;
      expiryStreamRef.current?.getTracks().forEach((t) => t.stop());
      expiryStreamRef.current = null;
    };
  }, [state.addStep]);

  const captureExpiryFrame = () => {
    const video = expiryVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        actions.captureExpiryPhoto(new File([blob], "expiry.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  };

  // Barcode capture: live camera scan (primary), photo upload (secondary), manual entry (fallback).
  const [barcodeMode, setBarcodeMode] = useState<"camera" | "manual">("camera");
  const [cameraStatus, setCameraStatus] = useState<"starting" | "scanning" | "error">("starting");

  // Receipt & fridge-photo capture: live camera preview + shutter (primary), photo upload
  // (secondary). Same one-still-frame-on-tap pattern as expiry capture, since this is also a
  // paid AI vision call rather than something we can run continuously per-frame.
  const [scanCameraStatus, setScanCameraStatus] = useState<"starting" | "ready" | "error">("starting");
  const [scanCameraError, setScanCameraError] = useState<string | null>(null);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (state.addStep !== 1) return;
    let cancelled = false;
    setScanCameraStatus("starting");
    setScanCameraError(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        scanStreamRef.current = stream;
        if (scanVideoRef.current) scanVideoRef.current.srcObject = stream;
        setScanCameraStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setScanCameraStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        setScanCameraError(
          /permission|notallowed/i.test(msg)
            ? "Camera access was denied — use the options below instead."
            : "Couldn't access the camera — use the options below instead."
        );
      });

    return () => {
      cancelled = true;
      scanStreamRef.current?.getTracks().forEach((t) => t.stop());
      scanStreamRef.current = null;
    };
  }, [state.addStep]);

  const captureScanFrame = () => {
    const video = scanVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        actions.captureReceiptOrPhoto(new File([blob], "scan.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95
    );
  };

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photoDecodeError, setPhotoDecodeError] = useState<string | null>(null);
  const [photoDecodeLoading, setPhotoDecodeLoading] = useState(false);
  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeControlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (state.addStep === 4) setBarcodeMode("camera");
  }, [state.addStep]);

  useEffect(() => {
    if (state.addStep !== 4 || barcodeMode !== "camera") return;
    let cancelled = false;
    setCameraStatus("starting");
    setCameraError(null);
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(undefined, barcodeVideoRef.current ?? undefined, (result, _err, controls) => {
        barcodeControlsRef.current = controls;
        if (cancelled || !result) return;
        controls.stop();
        actions.lookupBarcode(result.getText());
      })
      .then(() => {
        if (!cancelled) setCameraStatus("scanning");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        setCameraError(
          /permission|notallowed/i.test(msg)
            ? "Camera access was denied — use the options below instead."
            : "Couldn't access the camera — use the options below instead."
        );
      });

    return () => {
      cancelled = true;
      barcodeControlsRef.current?.stop();
      barcodeControlsRef.current = null;
    };
    // Only restart the camera when the step or mode actually changes — `actions` is a fresh
    // object every render and would otherwise tear down/restart the camera constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.addStep, barcodeMode]);

  const handleBarcodePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoDecodeError(null);
    setPhotoDecodeLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      actions.lookupBarcode(result.getText());
    } catch {
      setPhotoDecodeError("Couldn't find a barcode in that photo. Try again or use the camera.");
    } finally {
      setPhotoDecodeLoading(false);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg,#eaf6ff,#cfe8fb)",
        display: "flex",
        flexDirection: "column",
        animation: "slideUpSheet .32s cubic-bezier(0.32,0.72,0,1)",
      }}
    >
    <div className="thatfridge-wide-content" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 20px 30px", boxSizing: "border-box" }}>
      <div className="thatfridge-add-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{state.addStep === -1 ? "Add to fridge" : `Add to ${targetFridge?.name || "fridge"}`}</div>
        <div
          className="thatfridge-add-header-btn"
          onClick={state.addStep === 6 ? actions.skipExpiryPhoto : actions.goHome}
          style={{ width: 32, height: 32, borderRadius: 16, background: "#fff", border: "1px solid rgba(22,50,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color="rgba(22,50,92,0.5)" strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color="rgba(22,50,92,0.5)" strokeWidth={2.2} />
        </div>
      </div>

      {state.addStep === -1 && (
        <>
          <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)", marginBottom: 16 }}>Which fridge are you adding to?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {state.fridges.map((f, i) => {
              const itemCount = f.sections.reduce((n, sec) => n + sec.items.length, 0);
              return (
                <div key={f.id} onClick={() => actions.selectAddFridge(i)} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: 16, cursor: "pointer" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "#eaf6ff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <Refrigerator size={19} color="#4a6fa5" strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(22,50,92,0.5)" }}>{itemCount} item{itemCount === 1 ? "" : "s"}</div>
                  </div>
                  <ChevronRight size={17} color="rgba(22,50,92,0.3)" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {state.addStep === 0 && (
        <>
          <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)", marginBottom: 16 }}>Choose how you&apos;d like to add items</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SCAN_METHODS.map((m) => (
              <div key={m.key} onClick={() => actions.chooseMethod(m.key)} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: 16, cursor: "pointer" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#eaf6ff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <m.Icon size={19} color="#4a6fa5" strokeWidth={2} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(22,50,92,0.5)" }}>{m.desc}</div>
                </div>
                <ChevronRight size={17} color="rgba(22,50,92,0.3)" />
              </div>
            ))}
          </div>
        </>
      )}

      {state.addStep === 4 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {barcodeMode === "camera" ? (
            <>
              <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)", textAlign: "center" }}>Point your camera at the barcode</div>
              <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 20, overflow: "hidden", background: "#000" }}>
                <video ref={barcodeVideoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {cameraStatus === "scanning" && (
                  <div
                    style={{
                      position: "absolute",
                      left: "8%",
                      right: "8%",
                      top: "48%",
                      height: 2,
                      background: "#5ecbff",
                      boxShadow: "0 0 8px #5ecbff",
                      animation: "scanline 1.1s linear infinite",
                    }}
                  />
                )}
              </div>
              {cameraStatus === "starting" && (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(22,50,92,0.5)", textAlign: "center" }}>Starting camera…</div>
              )}
              {cameraError && <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c1452e", textAlign: "center" }}>{cameraError}</div>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)" }}>Type or paste the barcode number printed under it</div>
              <input
                autoFocus
                inputMode="numeric"
                value={state.barcodeInput}
                onChange={(e) => actions.onBarcodeInputChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && actions.lookupBarcode()}
                placeholder="e.g. 0123456789012"
                style={fieldStyle}
              />
              <div
                onClick={() => actions.lookupBarcode()}
                style={{
                  textAlign: "center",
                  padding: 14,
                  borderRadius: 14,
                  background: state.barcodeInput.trim() && !state.barcodeLoading ? "#16325c" : "rgba(22,50,92,0.25)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {state.barcodeLoading ? "Looking up…" : "Look up product"}
              </div>
            </>
          )}

          {state.barcodeLoading && barcodeMode === "camera" && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(22,50,92,0.5)", textAlign: "center" }}>Looking up product…</div>
          )}
          {state.barcodeError && <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c1452e", textAlign: "center" }}>{state.barcodeError}</div>}
          {photoDecodeLoading && <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(22,50,92,0.5)", textAlign: "center" }}>Reading photo…</div>}
          {photoDecodeError && <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c1452e", textAlign: "center" }}>{photoDecodeError}</div>}

          <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
            <div
              onClick={() => barcodePhotoInputRef.current?.click()}
              style={{ fontSize: 12.5, fontWeight: 700, color: "#4a6fa5", cursor: "pointer", textDecoration: "underline" }}
            >
              Upload a photo
            </div>
            <div
              onClick={() => setBarcodeMode(barcodeMode === "camera" ? "manual" : "camera")}
              style={{ fontSize: 12.5, fontWeight: 700, color: "#4a6fa5", cursor: "pointer", textDecoration: "underline" }}
            >
              {barcodeMode === "camera" ? "Enter manually" : "Use camera instead"}
            </div>
          </div>
          <input ref={barcodePhotoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleBarcodePhotoUpload} />
        </div>
      )}

      {state.addStep === 6 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)", textAlign: "center" }}>
            Line up the printed expiry / best-before date, then tap to capture
          </div>
          <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 20, overflow: "hidden", background: "#000" }}>
            <video ref={expiryVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          {expiryCameraStatus === "starting" && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(22,50,92,0.5)", textAlign: "center" }}>Starting camera…</div>
          )}
          {expiryCameraError && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c1452e", textAlign: "center" }}>{expiryCameraError}</div>
          )}
          {expiryCameraStatus === "ready" && (
            <div
              onClick={captureExpiryFrame}
              style={{
                alignSelf: "center",
                width: 64,
                height: 64,
                borderRadius: 32,
                background: "#16325c",
                border: "4px solid rgba(255,255,255,0.85)",
                boxShadow: "0 6px 16px rgba(22,50,92,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Camera size={26} color="#fff" strokeWidth={2} />
            </div>
          )}

          {state.expiryPhotoLoading && (
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(22,50,92,0.6)", textAlign: "center" }}>Reading the date…</div>
          )}
          {state.expiryPhotoError && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c1452e", textAlign: "center", padding: "0 20px" }}>
              {state.expiryPhotoError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
            <div
              onClick={() => expiryFileInputRef.current?.click()}
              style={{ fontSize: 12.5, fontWeight: 700, color: "#4a6fa5", cursor: "pointer", textDecoration: "underline" }}
            >
              Upload a photo
            </div>
            <div
              onClick={actions.skipExpiryPhoto}
              style={{ fontSize: 12.5, fontWeight: 700, color: "#4a6fa5", cursor: "pointer", textDecoration: "underline" }}
            >
              Skip — enter manually
            </div>
          </div>
          <input
            ref={expiryFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) actions.captureExpiryPhoto(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {state.addStep === 1 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)", textAlign: "center" }}>
            {state.scanMethod === "receipt" ? "Line up the whole receipt, then tap to capture" : "Line up the inside of your fridge, then tap to capture"}
          </div>
          <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 20, overflow: "hidden", background: "#000" }}>
            <video ref={scanVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          {scanCameraStatus === "starting" && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(22,50,92,0.5)", textAlign: "center" }}>Starting camera…</div>
          )}
          {scanCameraError && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c1452e", textAlign: "center" }}>{scanCameraError}</div>
          )}
          {scanCameraStatus === "ready" && !state.scanImageLoading && (
            <div
              onClick={captureScanFrame}
              style={{
                alignSelf: "center",
                width: 64,
                height: 64,
                borderRadius: 32,
                background: "#16325c",
                border: "4px solid rgba(255,255,255,0.85)",
                boxShadow: "0 6px 16px rgba(22,50,92,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Camera size={26} color="#fff" strokeWidth={2} />
            </div>
          )}

          {state.scanImageLoading && <div style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(22,50,92,0.6)", textAlign: "center" }}>{scanningLabel}</div>}
          {state.scanImageError && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#c1452e", textAlign: "center", padding: "0 20px" }}>{state.scanImageError}</div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
            <div
              onClick={() => scanFileInputRef.current?.click()}
              style={{ fontSize: 12.5, fontWeight: 700, color: "#4a6fa5", cursor: "pointer", textDecoration: "underline" }}
            >
              Upload a photo
            </div>
            <div
              onClick={() => actions.chooseMethod("manual")}
              style={{ fontSize: 12.5, fontWeight: 700, color: "#4a6fa5", cursor: "pointer", textDecoration: "underline" }}
            >
              Skip — enter manually
            </div>
          </div>
          <input
            ref={scanFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) actions.captureReceiptOrPhoto(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {state.addStep === 2 && (
        <>
          <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)", marginBottom: state.expiryScanNote ? 6 : 14 }}>
            {state.scanMethod === "barcode"
              ? "Found the product — double-check the details below before adding"
              : "Found " + state.detected.length + " items — the scan can’t tell expiry or storage, so set them below or tap Auto-fill"}
          </div>
          {state.expiryScanNote && (
            <div style={{ fontSize: 12, fontWeight: 600, color: "#4a6fa5", marginBottom: 14 }}>{state.expiryScanNote}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {state.detected.map((d) => (
              <div key={d.id} style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    onClick={() => setIconPickerForId(iconPickerForId === d.id ? null : d.id)}
                    title="Change picture"
                    style={{ position: "relative", width: 28, height: 28, flex: "none", cursor: "pointer" }}
                  >
                    <FoodIcon icon={d.icon} />
                  </div>
                  <input
                    value={d.name}
                    onChange={(e) => actions.onDetectedNameChange(d.id, e.target.value)}
                    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14, fontWeight: 600, color: "#16325c", padding: 0 }}
                  />
                  <div
                    onClick={() => actions.toggleDetected(d.id)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      border: `1.5px solid ${d.checked ? "#2f6fb0" : "rgba(22,50,92,0.25)"}`,
                      background: d.checked ? "#2f6fb0" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                      cursor: "pointer",
                    }}
                  >
                    {d.checked && <Check size={13} color="#fff" strokeWidth={2.5} />}
                  </div>
                </div>

                {iconPickerForId === d.id && (
                  <div style={{ maxHeight: 180, overflowY: "auto", background: "#eaf6ff", borderRadius: 12, padding: 10 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {FOOD_ICON_KEYS.map((key) => (
                        <div
                          key={key}
                          title={ICON_LABELS[key]}
                          onClick={() => {
                            actions.onDetectedIconChange(d.id, key);
                            setIconPickerForId(null);
                          }}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            background: "#fff",
                            border: `2px solid ${d.icon === key ? "#2f6fb0" : "transparent"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            flex: "none",
                          }}
                        >
                          <div style={{ position: "relative", width: 22, height: 22 }}>
                            <FoodIcon icon={key} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={d.section}
                    onChange={(e) => actions.onDetectedSectionChange(d.id, e.target.value)}
                    style={{ flex: 1, border: "none", outline: "none", background: "#eaf6ff", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, color: "#16325c", appearance: "none" }}
                  >
                    {sections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#eaf6ff", borderRadius: 10, padding: "0 8px", flex: "none" }}>
                    <div onClick={() => actions.adjustDetectedQty(d.id, -1)} style={{ cursor: "pointer", padding: 4, display: "flex" }}>
                      <Minus size={12} color="#16325c" strokeWidth={2.4} />
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#16325c", minWidth: 14, textAlign: "center" }}>{d.qty}</div>
                    <div onClick={() => actions.adjustDetectedQty(d.id, 1)} style={{ cursor: "pointer", padding: 4, display: "flex" }}>
                      <Plus size={12} color="#16325c" strokeWidth={2.4} />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="date"
                    value={d.expiryDate}
                    onChange={(e) => actions.onDetectedExpiryChange(d.id, e.target.value)}
                    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "#eaf6ff", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, color: "#16325c" }}
                  />
                  <LocationPicker value={d.location} onChange={(loc) => actions.onDetectedLocationChange(d.id, loc)} />
                  <ScanExpiryButton onClick={() => actions.startExpiryScanForDetected(d.id)} />
                  <AutoFillButton onClick={() => actions.suggestDetectedDetails(d.id)} loading={state.detectedAutoFillLoadingId === d.id} />
                </div>
              </div>
            ))}
          </div>
          <div onClick={actions.confirmAdd} style={{ textAlign: "center", padding: 14, borderRadius: 14, background: "#16325c", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 14 }}>
            Add {checkedCount} items
          </div>
        </>
      )}

      {state.addStep === 3 && (
        <>
          <div style={{ fontSize: 13, color: "rgba(22,50,92,0.55)", marginBottom: 16 }}>Fill in the details for this item</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div>
              <div style={labelStyle}>NAME</div>
              <input
                autoFocus
                value={state.manualName}
                onChange={(e) => actions.onManualNameChange(e.target.value)}
                placeholder="e.g. Sourdough bread"
                style={fieldStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>PICTURE</div>
              <div
                onClick={() => setShowIconPicker((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 14, padding: "8px 12px", cursor: "pointer" }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "#eaf6ff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <div style={{ position: "relative", width: 20, height: 20 }}>
                    <FoodIcon icon={state.manualIcon} />
                  </div>
                </div>
                <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#16325c" }}>
                  {ICON_LABELS[state.manualIcon] || "Choose a picture"}
                </div>
                <ChevronDown
                  size={16}
                  color="rgba(22,50,92,0.4)"
                  strokeWidth={2.2}
                  style={{ transform: showIconPicker ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                />
              </div>
              {showIconPicker && (
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", background: "#fff", borderRadius: 14, padding: 10, boxShadow: "0 6px 16px rgba(22,50,92,0.06)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {FOOD_ICON_KEYS.map((key) => (
                      <div
                        key={key}
                        title={ICON_LABELS[key]}
                        onClick={() => {
                          actions.onManualIconChange(key);
                          setShowIconPicker(false);
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          background: "#eaf6ff",
                          border: `2px solid ${state.manualIcon === key ? "#2f6fb0" : "transparent"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ position: "relative", width: 26, height: 26 }}>
                          <FoodIcon icon={key} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>FOOD GROUP</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {NUTRITION_CATEGORIES.map((c) => {
                  const active = state.manualCategory === c.key;
                  return (
                    <div
                      key={c.key}
                      onClick={() => actions.onManualCategoryChange(c.key)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        background: active ? "#16325c" : "#fff",
                        color: active ? "#fff" : "#16325c",
                        boxShadow: active ? "none" : "0 4px 10px rgba(22,50,92,0.06)",
                      }}
                    >
                      {c.label}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Bare native <select> with no chevron/affordance reads as broken on desktop — the
                section is already auto-picked from the item name (see onManualNameChange) and
                stays editable later from Item Detail, so this only needs to exist on mobile. */}
            <div className="thatfridge-hide-desktop">
              <div style={labelStyle}>STORE IN</div>
              <select
                value={state.manualSectionId}
                onChange={(e) => actions.onManualSectionChange(e.target.value)}
                style={{ ...fieldStyle, appearance: "none" }}
              >
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={labelStyle}>STORE WHERE</div>
              <LocationPicker value={state.manualLocation} onChange={actions.onManualLocationChange} />
            </div>
            <div>
              <div style={labelStyle}>BEST BEFORE</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="date"
                  value={state.manualExpiryDate}
                  onChange={(e) => actions.onManualExpiryDateChange(e.target.value)}
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <ScanExpiryButton onClick={actions.startExpiryScanForManual} />
                <AutoFillButton onClick={actions.suggestManualDetails} loading={state.manualAutoFillLoading} />
              </div>
              {state.manualAutoFillAskCondition && (
                <div style={{ marginTop: 8, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 14, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(22,50,92,0.5)", marginBottom: 8 }}>How does it look right now?</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {PRODUCE_CONDITIONS.map((opt) => (
                      <div
                        key={opt.key}
                        onClick={() => actions.chooseManualCondition(opt.key)}
                        style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "#f4f7fb", fontSize: 11, fontWeight: 700, color: "#16325c", cursor: "pointer" }}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>NOTE (OPTIONAL)</div>
              <input
                value={state.manualNote}
                onChange={(e) => actions.onManualNoteChange(e.target.value)}
                placeholder="e.g. 2 loaves"
                style={fieldStyle}
              />
            </div>
          </div>
          <div
            onClick={actions.confirmManualAdd}
            style={{
              textAlign: "center",
              padding: 14,
              borderRadius: 14,
              background: state.manualName.trim() ? "#16325c" : "rgba(22,50,92,0.25)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              marginTop: 14,
            }}
          >
            Add item
          </div>
        </>
      )}
    </div>
    </div>
  );
}