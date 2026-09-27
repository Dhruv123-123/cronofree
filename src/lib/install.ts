/**
 * "Feels like an app" plumbing: install prompt capture, standalone / native
 * detection, and a tiny haptics helper. All optional; every call is safe on
 * desktop browsers.
 */
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

/** Running inside the Capacitor shell (Android / iOS build). */
export const isNative = (): boolean => {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
};

/** Opened from the Home Screen (PWA) or the native shell, i.e. not in a browser tab. */
export const isStandalone = (): boolean =>
  isNative() || window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = (): boolean => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isSafari = (): boolean => /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(navigator.userAgent);

export interface InstallState {
  /** Browser offered a native install prompt (Chrome / Edge / Samsung on Android, desktop Chrome). */
  canPrompt: boolean;
  standalone: boolean;
  native: boolean;
  ios: boolean;
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export function useInstall(): InstallState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", l);
    return () => { listeners.delete(l); mq.removeEventListener?.("change", l); };
  }, []);
  return {
    canPrompt: !!deferred,
    standalone: isStandalone(),
    native: isNative(),
    ios: isIOS(),
    prompt: async () => {
      if (!deferred) return "unavailable";
      const ev = deferred;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === "accepted") deferred = null;
      notify();
      return outcome;
    },
  };
}

/** Short haptic tick on confirmations. No-op where unsupported (iOS Safari). */
export function haptic(kind: "light" | "success" | "warn" = "light"): void {
  try {
    if (typeof navigator.vibrate !== "function") return;
    const pattern: number[] = kind === "light" ? [8] : kind === "success" ? [10, 30, 12] : [20, 40, 20];
    navigator.vibrate(pattern);
  } catch { /* ignore */ }
}
