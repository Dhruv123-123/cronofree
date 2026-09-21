import { useEffect, useRef, useState } from "react";
import { Sheet, Button, Input } from "@/components/ui";

interface Detector { detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector } }

/**
 * Camera barcode scanner. Uses the native BarcodeDetector where available
 * (Chrome/Android) and falls back to ZXing (loaded on demand) elsewhere, incl. iOS Safari.
 */
export default function BarcodeScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    setError(null);
    let stream: MediaStream | null = null;
    let raf = 0;
    let zxingStop: (() => void) | null = null;
    let cancelled = false;

    const finish = (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (navigator.vibrate) navigator.vibrate(40);
      onCode(code.trim());
    };

    (async () => {
      try {
        const video = videoRef.current!;
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
          if (cancelled) return;
          video.srcObject = stream;
          await video.play();
          const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
          const tick = async () => {
            if (cancelled || doneRef.current) return;
            try {
              if (video.readyState >= 2) {
                const codes = await detector.detect(video);
                if (codes.length) return finish(codes[0].rawValue);
              }
            } catch { /* keep scanning */ }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (cancelled) return;
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
            if (result) finish(result.getText());
          });
          zxingStop = () => controls.stop();
        }
      } catch (e) {
        setError((e as Error).name === "NotAllowedError" ? "Camera access was denied. Allow the camera for this site or type the barcode below." : `Camera unavailable: ${(e as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, onCode]);

  return (
    <Sheet open={open} onClose={onClose} title="Scan barcode" noPad>
      <div className="relative mx-5 overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "4 / 3" }}>
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[38%] w-[78%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      </div>
      <div className="px-5 pb-5 pt-4">
        {error ? <p className="mb-3 text-[14px] text-warn">{error}</p> : <p className="mb-3 text-[13px] text-ink-2">Point the camera at the barcode. Products are looked up on Open Food Facts; anything not found can be created as a custom food.</p>}
        <div className="flex gap-2">
          <Input inputMode="numeric" placeholder="Or type the barcode number" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) onCode(manual.trim()); }} />
          <Button variant="primary" disabled={!manual.trim()} onClick={() => onCode(manual.trim())}>Look up</Button>
        </div>
      </div>
    </Sheet>
  );
}
