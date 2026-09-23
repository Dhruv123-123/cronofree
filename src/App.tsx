import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { bootstrap } from "@/lib/bootstrap";
import { startAutoSync } from "@/lib/sync";
import { installUsdaPack, installBrandedPack } from "@/lib/usdaPack";
import { installRestaurantPack } from "@/lib/restaurantPack";
import { warmSearchIndex } from "@/lib/searchIndex";
import { useProfile, useTheme } from "@/hooks";
import { ToastProvider, Button } from "@/components/ui";
import Shell from "@/components/Shell";

const Diary = lazy(() => import("@/features/diary/DiaryPage"));
const Foods = lazy(() => import("@/features/foods/FoodsPage"));
const Train = lazy(() => import("@/features/train/TrainPage"));
const Trends = lazy(() => import("@/features/trends/TrendsPage"));
const You = lazy(() => import("@/features/you/YouPage"));
const Onboarding = lazy(() => import("@/features/onboarding/Onboarding"));

function Loading() {
  return <div className="flex h-[60vh] items-center justify-center text-ink-3 anim-pulse text-[14px]">Loading…</div>;
}

function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[150] flex justify-center p-3 safe-top">
      <div className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 text-[14px] shadow-[var(--shadow)]">
        <span>A new version is ready.</span>
        <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>Update</Button>
      </div>
    </div>
  );
}

function Gate() {
  const profile = useProfile();
  useTheme(profile.theme);
  if (!profile.onboarded) return <Suspense fallback={<Loading />}><Onboarding /></Suspense>;
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Diary />} />
          <Route path="/foods/*" element={<Foods />} />
          <Route path="/train/*" element={<Train />} />
          <Route path="/trends/*" element={<Trends />} />
          <Route path="/you/*" element={<You />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stop = () => {};
    bootstrap().then(() => { setReady(true); warmSearchIndex(); stop = startAutoSync(); setTimeout(() => { void installRestaurantPack().catch(console.error); installUsdaPack().catch(console.error).then(() => installBrandedPack().catch(console.error)); }, 1500); }).catch((e) => { console.error(e); setReady(true); });
    return () => stop();
  }, []);
  if (!ready) return <Loading />;
  return (
    <BrowserRouter>
      <ToastProvider>
        <UpdateBanner />
        <Gate />
      </ToastProvider>
    </BrowserRouter>
  );
}
