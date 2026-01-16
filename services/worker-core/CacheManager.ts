import { ModelTier } from './types';

// ============================================
// STORAGE QUOTA MANAGEMENT (#5)
// ============================================
const STORAGE_QUOTA_LIMIT = 4 * 1024 * 1024; // 4MB (leave 1MB buffer from 5MB limit)
const CACHE_PREFIX = 'chk_';
let lastQuotaCheck = 0;
const QUOTA_CHECK_INTERVAL = 60000; // Check every 1 minute

async function checkStorageQuota(): Promise<void> {
    const now = Date.now();
    if (now - lastQuotaCheck < QUOTA_CHECK_INTERVAL) return;
    lastQuotaCheck = now;

    try {
        // Get storage usage
        const bytesInUse = await new Promise<number>((resolve) => {
            chrome.storage.local.getBytesInUse(null, (bytes) => {
                resolve(bytes);
            });
        });

        console.log(`[Crystal] Storage usage: ${(bytesInUse / 1024 / 1024).toFixed(2)}MB`);

        // If approaching limit, prune cache
        if (bytesInUse > STORAGE_QUOTA_LIMIT) {
            console.log('[Crystal] Storage quota near limit, pruning cache...');
            await pruneCache();
        }
    } catch (e) {
        console.error('[Crystal] Failed to check storage quota:', e);
    }
}

async function pruneCache(): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
            const cacheKeys = Object.keys(items).filter(k => k.startsWith(CACHE_PREFIX));

            if (cacheKeys.length === 0) {
                resolve();
                return;
            }

            // Remove half of the cache entries (oldest first by key order)
            const keysToRemove = cacheKeys.slice(0, Math.ceil(cacheKeys.length / 2));

            chrome.storage.local.remove(keysToRemove, () => {
                console.log(`[Crystal] Pruned ${keysToRemove.length} cache entries`);
                resolve();
            });
        });
    });
}

// ============================================
// DELTA HISTORY (for undo/redo)
// ============================================
class DeltaHistory {
    private past: string[] = [];
    private future: string[] = [];
    private current: string = "";

    constructor(initialText: string = "") {
        this.current = initialText;
    }

    push(newText: string) {
        this.past.push(this.current);
        this.future = [];
        this.current = newText;
    }

    undo(): string | null {
        if (this.past.length > 0) {
            const previous = this.past.pop()!;
            this.future.push(this.current);
            this.current = previous;
            return previous;
        }
        return null;
    }

    redo(): string | null {
        if (this.future.length > 0) {
            const next = this.future.pop()!;
            this.past.push(this.current);
            this.current = next;
            return next;
        }
        return null;
    }
}

// ============================================
// CACHE MANAGER
// ============================================
export class CacheManager {
    // Async Get from Persistent Storage
    async get(key: string): Promise<string | undefined> {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key] as string);
            });
        });
    }

    // Async Set to Persistent Storage (with quota check)
    async set(key: string, value: string): Promise<void> {
        // Check quota before writing
        await checkStorageQuota();

        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    console.error('[Crystal] Cache write failed:', chrome.runtime.lastError);
                    // Try to prune and retry once
                    pruneCache().then(() => {
                        chrome.storage.local.set({ [key]: value }, () => resolve());
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    // Check existence
    async has(key: string): Promise<boolean> {
        const val = await this.get(key);
        return !!val;
    }

    static getCacheKey(text: string, tier: ModelTier): string {
        return `${CACHE_PREFIX}${tier}_${text.length}_${text.slice(0, 16).replace(/\s/g, '')}`;
    }
}

export const globalCache = new CacheManager();
