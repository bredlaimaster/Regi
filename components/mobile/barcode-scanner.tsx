"use client";
/**
 * Barcode scanner for the mobile flows (web / Chrome / PWA).
 *
 * Two modes, toggled by a segmented control at the top:
 *
 *   - **Auto** (default): camera runs continuously while the parent keeps
 *     `active=true`. Every decoded barcode fires `onDetect`, with a 1-second
 *     global time-gate so the loop doesn't re-fire on the same label while
 *     the picker is still holding it.
 *   - **Manual**: camera is OFF until the user taps the "Tap to scan"
 *     button. When tapped we open the camera, forward the first detection
 *     to `onDetect`, then close the camera again. Tap again for the next
 *     item.
 *
 * Under the hood both modes share a single `getUserMedia` +
 * `BarcodeDetector` pipeline. A `armed` flag gates whether detections are
 * emitted (Auto → always armed; Manual → armed between tap and next hit).
 *
 * `BarcodeDetector` (Shape Detection API) is experimental. On devices that
 * don't expose it we fall back to manual-entry only. On plain-HTTP origins
 * `getUserMedia` is blocked by Chrome outside localhost — use Chrome's
 * `unsafely-treat-insecure-origin-as-secure` flag for dev, or put HTTPS on
 * the ALB for production.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, ScanBarcode, Zap, Hand, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Minimum gap between accepted barcodes in Auto mode. */
const AUTO_SCAN_COOLDOWN_MS = 1000;

export type BarcodeScannerProps = {
  /** When false, the camera is released regardless of mode. */
  active: boolean;
  /** Fires when a barcode is detected (camera or manual-entry). */
  onDetect: (code: string) => void;
  /** Fires on camera/permission errors. */
  onError?: (message: string) => void;
  /** Optional hint above the manual input. */
  manualHint?: string;
};

// Narrow types for the experimental BarcodeDetector API.
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "qr_code",
];

export function BarcodeScanner({ active, onDetect, onError, manualHint }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [cameraOn, setCameraOn] = useState(false);
  const [manualArmed, setManualArmed] = useState(false); // Manual: armed between tap and next hit
  const [manual, setManual] = useState("");

  // Keep the latest callbacks in refs so the scan effect doesn't tear down
  // and re-subscribe every render.
  const onDetectRef = useRef(onDetect);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onDetectRef.current = onDetect;
    onErrorRef.current = onError;
  }, [onDetect, onError]);

  // One-time feature detection.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported("BarcodeDetector" in window);
  }, []);

  // Camera runs whenever the parent says `active` AND (mode=auto OR user tapped "scan").
  const shouldRun = !!supported && active && (mode === "auto" || manualArmed);

  useEffect(() => {
    if (!shouldRun) {
      setCameraOn(false);
      return;
    }

    let stream: MediaStream | null = null;
    let stopped = false;
    let rafId = 0;
    let lastScanTs = 0; // per-mount so cooldown resets when the camera restarts

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const videoEl = videoRef.current;
        if (!videoEl) return;
        videoEl.srcObject = stream;
        await videoEl.play();
        setCameraOn(true);

        const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor })
          .BarcodeDetector;
        const detector = new Ctor({ formats: FORMATS });

        const loop = async () => {
          if (stopped) return;
          if (!videoEl || videoEl.readyState < 2) {
            rafId = requestAnimationFrame(loop);
            return;
          }
          try {
            const results = await detector.detect(videoEl);
            if (results.length > 0 && results[0].rawValue) {
              const code = results[0].rawValue;
              if (mode === "auto") {
                const now = Date.now();
                if (now - lastScanTs >= AUTO_SCAN_COOLDOWN_MS) {
                  lastScanTs = now;
                  onDetectRef.current(code);
                }
              } else {
                // Manual: emit the first hit and disarm. The camera tears
                // down via `shouldRun` flipping false on the next render.
                onDetectRef.current(code);
                setManualArmed(false);
              }
            }
          } catch {
            // ignore transient detection errors; keep looping.
          }
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        setCameraOn(false);
        const msg = err instanceof Error ? err.message : "Camera unavailable";
        onErrorRef.current?.(msg);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      setCameraOn(false);
    };
    // `mode` is intentionally a dep so switching modes fully resets the loop.
  }, [shouldRun, mode]);

  const submitManual = useCallback(() => {
    const code = manual.trim();
    if (!code) return;
    onDetect(code);
    setManual("");
  }, [manual, onDetect]);

  const switchMode = (next: "auto" | "manual") => {
    if (next === mode) return;
    setManualArmed(false);
    setMode(next);
  };

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
        <button
          type="button"
          onClick={() => switchMode("auto")}
          className={`flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition ${
            mode === "auto" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Zap className="h-4 w-4" /> Auto
        </button>
        <button
          type="button"
          onClick={() => switchMode("manual")}
          className={`flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition ${
            mode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Hand className="h-4 w-4" /> Manual
        </button>
      </div>

      {/* Scanner area */}
      {supported === false ? (
        <div className="aspect-[4/3] bg-muted rounded-lg border flex items-center justify-center text-center p-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <Keyboard className="h-6 w-6 mx-auto" />
            <div>Camera scanning not supported on this device.</div>
            <div>Use the keypad below.</div>
          </div>
        </div>
      ) : mode === "auto" || manualArmed ? (
        <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden border">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
          />
          <div className="absolute inset-x-8 inset-y-14 border-2 border-white/70 rounded-lg pointer-events-none" />
          <div className="absolute inset-x-10 top-1/2 h-0.5 bg-red-500/80 pointer-events-none" />
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded">
            {cameraOn ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
            {cameraOn ? (mode === "auto" ? "Auto" : "Waiting for scan…") : "Off"}
          </div>
          {mode === "manual" && manualArmed && (
            <div className="absolute bottom-2 right-2">
              <Button size="sm" variant="secondary" onClick={() => setManualArmed(false)}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      ) : (
        // Manual mode, idle — big tap-to-scan button.
        <Button
          size="lg"
          className="w-full h-32 text-lg flex-col gap-2"
          onClick={() => setManualArmed(true)}
        >
          <ScanBarcode className="h-8 w-8" />
          Tap to scan
          <span className="text-xs font-normal opacity-80">One tap · one scan</span>
        </Button>
      )}

      {/* Manual-entry fallback, always visible */}
      <div className="space-y-1">
        {manualHint && <p className="text-xs text-muted-foreground">{manualHint}</p>}
        <div className="flex gap-2">
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder="Type or paste barcode"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitManual();
            }}
          />
          <Button onClick={submitManual} disabled={!manual.trim()}>
            Enter
          </Button>
        </div>
      </div>
    </div>
  );
}
