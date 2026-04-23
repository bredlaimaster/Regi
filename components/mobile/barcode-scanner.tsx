"use client";
/**
 * Barcode scanner for the mobile flows.
 *
 * Architecture
 * ────────────
 * One component, two backends behind the same interface:
 *   1. **Native `BarcodeDetector`** — Chrome ≥83 on Android, all modern WebViews.
 *      Zero bundle cost, uses Google's on-device shape detection.
 *   2. **Manual-entry fallback** — if `BarcodeDetector` is absent we render a
 *      text input so the picker can type a code off the label. Also visible
 *      on top of the camera view as an "emergency keypad" in case a barcode
 *      is damaged.
 *
 * When we wrap this Next app with Capacitor to produce an APK, the plan is to
 * swap the camera-loop branch for `@capacitor/mlkit-barcode-scanning`. The
 * consumer API (`active`, `onDetect`, `onError`) stays identical — that's
 * the whole point of this seam.
 *
 * Caveats
 * ───────
 * - `getUserMedia` requires a secure context. On `localhost` and inside a
 *   Capacitor WebView this is fine; on plain-HTTP deployments it is not — the
 *   user will see the manual-entry fallback until the ALB gets TLS.
 * - The detection loop uses `requestAnimationFrame` to stay at ~60fps with
 *   zero extra timers. We tear the stream down in the cleanup to release the
 *   camera when the component unmounts or `active` flips false.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BarcodeScannerProps = {
  /** When false, the camera is released and the loop stops. */
  active: boolean;
  /** Fires when a barcode is detected or manually submitted. */
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

const SUPPORTED_FORMATS = [
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
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");

  // Stable handler refs so the effect doesn't re-subscribe on every render.
  const onDetectRef = useRef(onDetect);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onDetectRef.current = onDetect;
    onErrorRef.current = onError;
  }, [onDetect, onError]);

  // Detect support once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasDetector = "BarcodeDetector" in window;
    setSupported(hasDetector);
  }, []);

  // Main camera + detection loop.
  useEffect(() => {
    if (!active || !supported) {
      setCameraOn(false);
      return;
    }

    let stream: MediaStream | null = null;
    let stopped = false;
    let rafId = 0;

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

        const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
        const detector = new Ctor({ formats: SUPPORTED_FORMATS });

        const loop = async () => {
          if (stopped) return;
          if (!videoEl || videoEl.readyState < 2) {
            rafId = requestAnimationFrame(loop);
            return;
          }
          try {
            const results = await detector.detect(videoEl);
            if (results.length > 0 && results[0].rawValue) {
              onDetectRef.current(results[0].rawValue);
              // Brief cooldown so a single scan doesn't fire 60× per second
              // — the consumer decides whether to keep scanning.
              await new Promise((r) => setTimeout(r, 600));
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
  }, [active, supported]);

  const submitManual = useCallback(() => {
    const code = manual.trim();
    if (!code) return;
    onDetect(code);
    setManual("");
  }, [manual, onDetect]);

  return (
    <div className="space-y-3">
      {supported ? (
        <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden border">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            playsInline
          />
          {/* Scan target overlay */}
          <div className="absolute inset-x-8 inset-y-14 border-2 border-white/70 rounded-lg pointer-events-none" />
          <div className="absolute inset-x-10 top-1/2 h-0.5 bg-red-500/80 pointer-events-none" />
          {/* Camera status pill */}
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-1 rounded">
            {cameraOn ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
            {cameraOn ? "Live" : "Off"}
          </div>
        </div>
      ) : (
        <div className="aspect-[4/3] bg-muted rounded-lg border flex items-center justify-center text-center p-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <Keyboard className="h-6 w-6 mx-auto" />
            <div>Camera scanning not supported on this device.</div>
            <div>Use the keypad below.</div>
          </div>
        </div>
      )}

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
          <Button onClick={submitManual} disabled={!manual.trim()}>Enter</Button>
        </div>
      </div>
    </div>
  );
}
