import { useEffect, useState } from "react";
import { Smartphone, Share, PlusSquare, MoreVertical, X } from "lucide-react";
import { useInstall } from "@/lib/install";
import { kvGet, kvSet } from "@/db";
import { Button, Sheet, useToast } from "@/components/ui";

/**
 * Nudges a browser-tab user to install the app. Hidden once installed, in the
 * native shell, or after being dismissed (per device). Android / desktop Chrome
 * get the real install prompt; iOS gets the Share → Add to Home Screen steps.
 */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const inst = useInstall();
  const toast = useToast();
  const [hidden, setHidden] = useState(true);
  const [how, setHow] = useState(false);
  useEffect(() => { kvGet<boolean>("installDismissed", false).then((d) => setHidden(d)); }, []);
  if (inst.standalone || hidden) return null;

  const install = async () => {
    if (inst.canPrompt) {
      const r = await inst.prompt();
      if (r === "accepted") toast("Installed · open Cronofree from your Home Screen");
    } else setHow(true);
  };
  const dismiss = () => { setHidden(true); void kvSet("installDismissed", true); };

  return (
    <>
      <section className={`card flex items-center gap-3 ${compact ? "p-3" : "p-4"}`}>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Smartphone size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">Install Cronofree</div>
          <div className="text-[12px] text-ink-3">Full-screen, offline, with its own icon. No app store needed.</div>
        </div>
        <Button size="sm" variant="primary" onClick={install}>{inst.canPrompt ? "Install" : "How"}</Button>
        <button onClick={dismiss} aria-label="Dismiss" className="grid size-8 place-items-center rounded-full text-ink-3"><X size={16} /></button>
      </section>
      <Sheet open={how} onClose={() => setHow(false)} title="Add to your Home Screen">
        <div className="flex flex-col gap-3 text-[14px]">
          {inst.ios ? (
            <>
              <p className="text-ink-2">On iPhone and iPad this has to be done from <b>Safari</b> (Chrome and other browsers can't install apps on iOS).</p>
              <ol className="space-y-3">
                <Step n={1} icon={<Share size={18} />}>Tap the <b>Share</b> button in Safari's toolbar.</Step>
                <Step n={2} icon={<PlusSquare size={18} />}>Scroll down and tap <b>Add to Home Screen</b>.</Step>
                <Step n={3} icon={<Smartphone size={18} />}>Tap <b>Add</b>. Open Cronofree from the icon from now on: it launches full-screen and works offline.</Step>
              </ol>
            </>
          ) : (
            <ol className="space-y-3">
              <Step n={1} icon={<MoreVertical size={18} />}>Open the browser menu (⋮ in Chrome, ⋯ in Edge or Samsung Internet).</Step>
              <Step n={2} icon={<PlusSquare size={18} />}>Tap <b>Install app</b> or <b>Add to Home screen</b>.</Step>
              <Step n={3} icon={<Smartphone size={18} />}>Open Cronofree from the icon from now on: it launches full-screen and works offline.</Step>
            </ol>
          )}
          <p className="text-[12px] text-ink-3">Your data stays on this device either way. Installing just removes the browser chrome and lets the app launch without a network.</p>
        </div>
      </Sheet>
    </>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-raised text-ink-2">{icon}</div>
      <div className="pt-1"><span className="mr-1 text-ink-3">{n}.</span>{children}</div>
    </li>
  );
}
