import type { WorkoutDraft } from "@/db/types";

const KEY = "cronofree_workout_draft_v1";

export function loadDraft(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WorkoutDraft) : null;
  } catch { return null; }
}
export function saveDraft(d: WorkoutDraft | null): void {
  try {
    if (!d) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* storage full or private mode */ }
}
