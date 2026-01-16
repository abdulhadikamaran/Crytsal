/*
 * Key Manager Module
 * Handles API key status tracking, cooldowns, and custom key management
 * Features: State persistence, 5 worker slots, optimized storage reads
 */

import { API_KEYS, MAX_WORKERS, reloadKeysFromStorage, updateApiKey as configUpdateApiKey, hasApiKeys, getActiveKeyCount } from './config';

// ============================================
// TYPES
// ============================================
export interface KeyStatus {
    keyIndex: number;
    status: 'ready' | 'cooldown' | 'dead' | 'empty';
    lastError?: string;
    lastUsed?: number;
    successCount: number;
    errorCount: number;
    cooldownUntil?: number;
    maskedKey?: string; // Last 4 chars for display
}

interface PersistedState {
    keyStatuses: KeyStatus[];
    lastSaved: number;
}

// ============================================
// CONSTANTS
// ============================================
const COOLDOWN_429_MS = 60000;  // 60 seconds for rate limit
const COOLDOWN_5XX_MS = 30000;  // 30 seconds for server errors
const PERSIST_INTERVAL_MS = 10000; // Save state every 10 seconds
const STORAGE_KEY = 'crystalKeyManagerState';

// ============================================
// STATE (In-memory, persisted periodically)
// ============================================
let keyStatuses: KeyStatus[] = [];
let persistTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;

// ============================================
// STATE PERSISTENCE
// ============================================
function schedulePerist(): void {
    if (persistTimeoutId) return;

    persistTimeoutId = setTimeout(() => {
        persistTimeoutId = null;
        if (isDirty) {
            persistState();
        }
    }, PERSIST_INTERVAL_MS);
}

function persistState(): void {
    const state: PersistedState = {
        keyStatuses: keyStatuses.map(k => ({ ...k })),
        lastSaved: Date.now()
    };

    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
        isDirty = false;
        console.log('[Crystal] Key state persisted to storage');
    });
}

async function loadPersistedState(): Promise<boolean> {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const state = result[STORAGE_KEY] as PersistedState | undefined;

            if (state && state.keyStatuses && Array.isArray(state.keyStatuses)) {
                if (state.keyStatuses.length === MAX_WORKERS) {
                    const now = Date.now();
                    keyStatuses = state.keyStatuses.map((k, i) => {
                        // Check if cooldown has expired
                        if (k.status === 'cooldown' && k.cooldownUntil) {
                            if (now >= k.cooldownUntil) {
                                // Check if slot has a key
                                if (API_KEYS[i]) {
                                    return {
                                        ...k,
                                        keyIndex: i,
                                        status: 'ready' as const,
                                        cooldownUntil: undefined,
                                        lastError: undefined
                                    };
                                } else {
                                    return {
                                        ...k,
                                        keyIndex: i,
                                        status: 'empty' as const,
                                        cooldownUntil: undefined
                                    };
                                }
                            }
                        }
                        return { ...k, keyIndex: i };
                    });
                    console.log('[Crystal] Restored key state from storage');
                    resolve(true);
                    return;
                }
            }
            resolve(false);
        });
    });
}

function markDirty(): void {
    isDirty = true;
    schedulePerist();
}

// ============================================
// INITIALIZATION - Always creates 5 slots
// ============================================
export function initKeyStatuses(): void {
    keyStatuses = [];
    for (let i = 0; i < MAX_WORKERS; i++) {
        const key = API_KEYS[i];
        keyStatuses.push({
            keyIndex: i,
            status: key ? 'ready' : 'empty',
            successCount: 0,
            errorCount: 0,
            maskedKey: key ? key.slice(-4) : undefined
        });
    }
    console.log(`[Crystal] Initialized ${MAX_WORKERS} worker slots. Active: ${getActiveKeyCount()}`);
}

// ============================================
// GETTERS
// ============================================
export function getKeyStatuses(): KeyStatus[] {
    // Always return all 5 slots, synced with current API_KEYS
    return keyStatuses.map((status, i) => {
        const key = API_KEYS[i];
        return {
            ...status,
            status: key ? status.status : 'empty',
            maskedKey: key ? key.slice(-4) : undefined
        };
    });
}

export function getKeyStatus(index: number): KeyStatus | undefined {
    return keyStatuses[index];
}

export function hasNoApiKeys(): boolean {
    return !hasApiKeys();
}

// ============================================
// COOLDOWN RECOVERY
// ============================================
function checkCooldownRecovery(keyIndex: number): void {
    const status = keyStatuses[keyIndex];
    if (!status) return;

    if (status.status === 'cooldown' && status.cooldownUntil) {
        if (Date.now() >= status.cooldownUntil) {
            if (API_KEYS[keyIndex]) {
                status.status = 'ready';
                status.cooldownUntil = undefined;
                status.lastError = undefined;
                console.log(`[Crystal] Key ${keyIndex + 1} recovered from cooldown`);
                markDirty();
            }
        }
    }
}

// ============================================
// KEY USABILITY CHECK
// ============================================
export function isKeyUsable(keyIndex: number): boolean {
    if (!API_KEYS[keyIndex]) return false;

    const status = keyStatuses[keyIndex];
    if (!status) return false;
    if (status.status === 'empty') return false;

    checkCooldownRecovery(keyIndex);
    return status.status === 'ready';
}

export function getNextUsableKeyIndex(): number | null {
    for (let i = 0; i < MAX_WORKERS; i++) {
        if (isKeyUsable(i)) {
            return i;
        }
    }
    return null;
}

export function areAllKeysDead(): boolean {
    if (!hasApiKeys()) return true;

    for (let i = 0; i < MAX_WORKERS; i++) {
        if (API_KEYS[i] && keyStatuses[i]?.status !== 'dead') {
            return false;
        }
    }
    return true;
}

export function areAllKeysUnavailable(): boolean {
    for (let i = 0; i < MAX_WORKERS; i++) {
        if (isKeyUsable(i)) {
            return false;
        }
    }
    return true;
}

// ============================================
// STATUS UPDATES
// ============================================
export function updateKeyStatus(keyIndex: number, success: boolean, httpStatus?: number, error?: string): void {
    const status = keyStatuses[keyIndex];
    if (!status || !API_KEYS[keyIndex]) return;

    status.lastUsed = Date.now();

    if (success) {
        status.status = 'ready';
        status.successCount++;
        status.cooldownUntil = undefined;
        status.lastError = undefined;
    } else {
        status.errorCount++;
        status.lastError = error;

        if (httpStatus === 401 || httpStatus === 403) {
            status.status = 'dead';
            console.log(`[Crystal] Key ${keyIndex + 1} marked DEAD: ${httpStatus} - Key is invalid`);
        }
        else if (httpStatus === 429) {
            status.status = 'cooldown';
            status.cooldownUntil = Date.now() + COOLDOWN_429_MS;
            console.log(`[Crystal] Key ${keyIndex + 1} in COOLDOWN: Rate limited`);
        }
        else if (httpStatus && httpStatus >= 500) {
            status.status = 'cooldown';
            status.cooldownUntil = Date.now() + COOLDOWN_5XX_MS;
            console.log(`[Crystal] Key ${keyIndex + 1} in COOLDOWN: Server error`);
        }
        else {
            status.status = 'cooldown';
            status.cooldownUntil = Date.now() + COOLDOWN_5XX_MS;
        }
    }

    markDirty();
}

// ============================================
// USER KEY MANAGEMENT
// ============================================
export async function updateUserApiKey(keyIndex: number, newKey: string): Promise<void> {
    await configUpdateApiKey(keyIndex, newKey);

    if (keyStatuses[keyIndex]) {
        keyStatuses[keyIndex].status = 'ready';
        keyStatuses[keyIndex].cooldownUntil = undefined;
        keyStatuses[keyIndex].successCount = 0;
        keyStatuses[keyIndex].errorCount = 0;
        keyStatuses[keyIndex].lastError = undefined;
        keyStatuses[keyIndex].maskedKey = newKey.slice(-4);
    }
    console.log(`[Crystal] Key ${keyIndex + 1} updated by user`);
    markDirty();
}

export async function removeUserApiKey(keyIndex: number): Promise<void> {
    await configUpdateApiKey(keyIndex, null);

    if (keyStatuses[keyIndex]) {
        keyStatuses[keyIndex].status = 'empty';
        keyStatuses[keyIndex].cooldownUntil = undefined;
        keyStatuses[keyIndex].successCount = 0;
        keyStatuses[keyIndex].errorCount = 0;
        keyStatuses[keyIndex].lastError = undefined;
        keyStatuses[keyIndex].maskedKey = undefined;
    }
    console.log(`[Crystal] Key ${keyIndex + 1} removed`);
    markDirty();
}

// Legacy function - now same as remove
export async function resetUserApiKey(keyIndex: number): Promise<void> {
    return removeUserApiKey(keyIndex);
}

// ============================================
// LOAD ON STARTUP
// ============================================
export async function loadCustomKeys(): Promise<void> {
    await reloadKeysFromStorage();

    const restored = await loadPersistedState();

    if (!restored) {
        initKeyStatuses();
    } else {
        // Sync statuses with actual keys
        for (let i = 0; i < MAX_WORKERS; i++) {
            const key = API_KEYS[i];
            const status = keyStatuses[i];
            if (status) {
                if (!key) {
                    status.status = 'empty';
                    status.maskedKey = undefined;
                } else {
                    status.maskedKey = key.slice(-4);
                    if (status.status === 'empty') {
                        status.status = 'ready';
                    }
                }
            }
        }
    }

    console.log(`[Crystal] Loaded ${getActiveKeyCount()} active API keys`);
}

// ============================================
// FORCE PERSIST
// ============================================
export function forcePersist(): void {
    if (isDirty) {
        persistState();
    }
}

// ============================================
// HEALTH CHECK
// ============================================
export async function healthCheck(): Promise<void> {
    if (!hasApiKeys()) {
        console.log('[Crystal] Health check: No API keys configured');
        return;
    }

    let recovered = 0;

    for (let i = 0; i < MAX_WORKERS; i++) {
        const status = keyStatuses[i];
        if (API_KEYS[i] && status && status.status === 'dead') {
            status.status = 'ready';
            status.lastError = 'Reset by health check';
            recovered++;
        }
    }

    if (recovered > 0) {
        console.log(`[Crystal] Health check: Reset ${recovered} dead keys to ready`);
        markDirty();
    }
}
