import { useEffect, useRef, useState, useCallback } from "react";

/** Rest timer with a Web Audio chime; audio is unlocked on first tap (iOS). */
export function useRestTimer() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const endAtRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chimedRef = useRef(false);

  const unlock = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!ctxRef.current) ctxRef.current = new Ctor();
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* no audio */ }
  }, []);

  useEffect(() => {
    const h = () => unlock();
    window.addEventListener("pointerdown", h, { once: true });
    return () => window.removeEventListener("pointerdown", h);
  }, [unlock]);

  const chime = useCallback(() => {
    try {
      const ctx = ctxRef.current;
      if (!ctx || ctx.state === "suspended") return;
      for (const [i, f] of [880, 1175].entries()) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.frequency.value = f;
        const t = ctx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.start(t); osc.stop(t + 0.5);
      }
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = Math.max(0, Math.round(((endAtRef.current ?? 0) - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !chimedRef.current) { chimedRef.current = true; chime(); setRunning(false); }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running, chime]);

  const start = useCallback((seconds: number) => { endAtRef.current = Date.now() + seconds * 1000; chimedRef.current = false; setSecondsLeft(seconds); setRunning(true); }, []);
  const stop = useCallback(() => { endAtRef.current = null; setRunning(false); setSecondsLeft(0); }, []);
  const adjust = useCallback((delta: number) => { if (endAtRef.current) { endAtRef.current = Math.max(Date.now(), endAtRef.current + delta * 1000); setSecondsLeft(Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000))); } }, []);

  return { secondsLeft, running, start, stop, adjust };
}

export type RestTimer = ReturnType<typeof useRestTimer>;
