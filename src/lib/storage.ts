/**
 * Durable storage: ask the browser to never evict this origin's IndexedDB
 * (Chrome/Edge grant it for installed PWAs and frequently used sites; Safari
 * grants it to Home Screen apps). Without it a storage-pressure cleanup could
 * wipe local data, so we ask once onboarded and expose the state in Settings.
 */
export interface StorageState { persisted: boolean | null; usage?: number; quota?: number }

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export async function storageState(): Promise<StorageState> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
    return { persisted, usage: est.usage, quota: est.quota };
  } catch { return { persisted: null }; }
}

export const fmtBytes = (n?: number) => n == null ? "?" : n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(0)} MB` : `${Math.round(n / 1e3)} KB`;
