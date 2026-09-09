export const MODEL_8B = 'openai/gpt-oss-20b';
export const MODEL_70B = 'openai/gpt-oss-120b';
export const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const MODELS_URL = 'https://api.groq.com/openai/v1/models';

export const PRICE_8B_IN = 0.075 / 1e6;
export const PRICE_8B_OUT = 0.30 / 1e6;
export const PRICE_70B_IN = 0.15 / 1e6;
export const PRICE_70B_OUT = 0.60 / 1e6;

// Number of worker slots available
export const MAX_WORKERS = 5;

// Mutable keys array - populated from user storage only
// This stores the actual keys (not slots)
export let API_KEYS: (string | null)[] = [null, null, null, null, null];

// Function to reload keys from storage (called by background script)
export async function reloadKeysFromStorage(): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.get(['customApiKeys'], (result) => {
            const customKeys = result.customApiKeys as (string | null)[] | undefined;
            if (customKeys && Array.isArray(customKeys)) {
                // Ensure we always have MAX_WORKERS slots
                API_KEYS = [];
                for (let i = 0; i < MAX_WORKERS; i++) {
                    API_KEYS[i] = customKeys[i] || null;
                }
            } else {
                API_KEYS = [null, null, null, null, null];
            }
            const activeCount = API_KEYS.filter(k => k !== null).length;
            console.log(`[Crystal] Loaded ${activeCount} active API keys from storage`);
            resolve();
        });
    });
}

// Function to update a single key at a specific slot
export async function updateApiKey(index: number, newKey: string | null): Promise<void> {
    if (index < 0 || index >= MAX_WORKERS) {
        console.error(`[Crystal] Invalid key index: ${index}`);
        return;
    }

    return new Promise((resolve) => {
        chrome.storage.local.get(['customApiKeys'], (result) => {
            const customKeys = (result.customApiKeys as (string | null)[]) || [null, null, null, null, null];

            // Ensure array is correct size
            while (customKeys.length < MAX_WORKERS) {
                customKeys.push(null);
            }

            customKeys[index] = newKey;
            chrome.storage.local.set({ customApiKeys: customKeys }, () => {
                API_KEYS[index] = newKey;
                console.log(`[Crystal] Updated API key at slot ${index + 1}. Active keys: ${API_KEYS.filter(k => k !== null).length}`);
                resolve();
            });
        });
    });
}

// Function to remove a key from a slot
export async function removeApiKey(index: number): Promise<void> {
    return updateApiKey(index, null);
}

// Get the actual usable keys (non-null entries)
export function getUsableKeys(): { index: number; key: string }[] {
    const usable: { index: number; key: string }[] = [];
    for (let i = 0; i < API_KEYS.length; i++) {
        if (API_KEYS[i]) {
            usable.push({ index: i, key: API_KEYS[i]! });
        }
    }
    return usable;
}

// Check if there are any API keys configured
export function hasApiKeys(): boolean {
    return API_KEYS.some(k => k !== null);
}

// Get count of active keys
export function getActiveKeyCount(): number {
    return API_KEYS.filter(k => k !== null).length;
}
