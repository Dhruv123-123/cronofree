import { db, put, remove } from "@/db";
import type { Photo, ISODate } from "@/db/types";
import { uid } from "./id";
import { scheduleSync } from "./sync";
import { toISODate } from "./dates";

/** Resize + compress a picked image file to a JPEG data URL (~80–200 KB). */
export async function compressImage(file: File, maxSide = 1200, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Could not read image"));
    i.src = dataUrl;
  });
  let w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function addPhoto(dataUrl: string, opts: { date?: ISODate; note?: string; workoutId?: string } = {}): Promise<Photo> {
  const p: Photo = { id: uid("ph"), date: opts.date ?? toISODate(), at: Date.now(), dataUrl, note: opts.note, workoutId: opts.workoutId, updatedAt: 0 };
  await put("photos", p);
  scheduleSync();
  return p;
}

export async function deletePhoto(id: string): Promise<void> {
  await remove("photos", id);
  scheduleSync();
}

export async function allPhotos(): Promise<Photo[]> {
  return db.photos.orderBy("at").filter((p) => !p.deletedAt).toArray();
}

/** Pick n photos evenly spaced across the list, always keeping first and last. */
export function pickEvenlySpaced<T>(list: T[], n = 5): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let idx = Math.round((i * (list.length - 1)) / (n - 1));
    while (used.has(idx) && idx < list.length - 1) idx++;
    used.add(idx);
    out.push(list[idx]);
  }
  return out;
}
