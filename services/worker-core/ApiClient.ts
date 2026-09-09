/*
 * API Client Module
 * Handles all communication with Groq API
 * Features: Request deduplication, network retry, dynamic timeout
 */

import { MODEL_8B, MODEL_70B, API_URL, PRICE_8B_IN, PRICE_8B_OUT, PRICE_70B_IN, PRICE_70B_OUT, API_KEYS } from './config';
import { ModelTier } from './types';
import { PromptRegistry } from './PromptRegistry';
import { globalCache, CacheManager } from './CacheManager';
import { isKeyUsable, updateKeyStatus, getNextUsableKeyIndex, areAllKeysDead, areAllKeysUnavailable } from './KeyManager';
import { logRequest } from './RequestLogger';

// ============================================
// CONSTANTS
// ============================================
const TIMEOUT_8B_MS = 8000;   // 8 seconds for fast model
const TIMEOUT_70B_MS = 20000; // 20 seconds for large model (#9 Dynamic timeout)
const MAX_NETWORK_RETRIES = 2; // Retry for network failures (#8)

// ============================================
// REQUEST DEDUPLICATION (#4, #5)
// ============================================
interface PendingRequest {
    promise: Promise<{ text: string; modelUsed: ModelTier; cached: boolean }>;
    timestamp: number;
}
const pendingRequests = new Map<string, PendingRequest>();
const PENDING_EXPIRE_MS = 30000; // Expire after 30 seconds

function getRequestHash(text: string, tier: ModelTier): string {
    let hash = 0;
    const str = text + tier;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

function cleanupExpiredPending(): void {
    const now = Date.now();
    for (const [key, pending] of pendingRequests.entries()) {
        if (now - pending.timestamp > PENDING_EXPIRE_MS) {
            pendingRequests.delete(key);
        }
    }
}

// ============================================
// EXHAUSTION TRACKING
// ============================================
let exhaustionTimestamp: number | null = null;
let consecutiveFailures = 0;
const EXHAUSTION_COOLDOWN_MS = 60000; // 1 minute

function markExhausted(): void {
    exhaustionTimestamp = Date.now();
    consecutiveFailures = 0;

    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'batman-logo-png_seeklogo-17070.png',
        title: 'Crystal is Resting',
        message: 'All API keys are rate-limited. Try again in 1 minute.',
        priority: 1
    }).catch(() => { });
}

export function isExhausted(): boolean {
    if (!exhaustionTimestamp) return false;
    if (Date.now() - exhaustionTimestamp > EXHAUSTION_COOLDOWN_MS) {
        exhaustionTimestamp = null;
        return false;
    }
    return true;
}

export function getExhaustionEndTime(): number | null {
    return exhaustionTimestamp ? exhaustionTimestamp + EXHAUSTION_COOLDOWN_MS : null;
}

export function resetExhaustion(): void {
    exhaustionTimestamp = null;
    consecutiveFailures = 0;
    console.log('[Crystal] Exhaustion reset by health check');
}

// ============================================
// FETCH WITH TIMEOUT + NETWORK RETRY (#8)
// ============================================
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    timeoutMs: number,
    networkRetry: number = 0
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error: unknown) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('REQUEST_TIMEOUT');
        }

        // Network error - retry (#8)
        if (networkRetry < MAX_NETWORK_RETRIES) {
            console.log(`[Crystal] Network error, retrying (${networkRetry + 1}/${MAX_NETWORK_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (networkRetry + 1)));
            return fetchWithRetry(url, options, timeoutMs, networkRetry + 1);
        }

        throw new Error('NETWORK_ERROR');
    }
}

// ============================================
// INTERNAL API CALL (without dedup)
// ============================================
async function executeCorrection(
    text: string,
    tier: ModelTier,
    requestId: string,
    retryCount: number = 0
): Promise<{ text: string; modelUsed: ModelTier; cached: boolean }> {
    const startTime = Date.now();
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;
    const timeoutMs = tier === '8b' ? TIMEOUT_8B_MS : TIMEOUT_70B_MS;

    // Check if all keys are dead
    if (areAllKeysDead()) {
        logRequest({
            id: requestId,
            timestamp: Date.now(),
            text: text.substring(0, 50),
            result: 'error',
            latencyMs: 0,
            error: 'ALL_KEYS_DEAD'
        });
        throw new Error('ALL_KEYS_DEAD');
    }

    // Check exhaustion
    if (isExhausted()) {
        logRequest({
            id: requestId,
            timestamp: Date.now(),
            text: text.substring(0, 50),
            result: 'error',
            latencyMs: 0,
            error: 'API_EXHAUSTED'
        });
        throw new Error('API_EXHAUSTED');
    }

    // Check cache
    const cacheKey = CacheManager.getCacheKey(text, tier);
    const cachedValue = await globalCache.get(cacheKey);
    if (cachedValue) {
        logRequest({
            id: requestId,
            timestamp: Date.now(),
            text: text.substring(0, 50),
            result: 'cached',
            latencyMs: Date.now() - startTime
        });
        return { text: cachedValue, modelUsed: tier, cached: true };
    }

    // Get usable key
    const keyIndex = getNextUsableKeyIndex();
    if (keyIndex === null) {
        consecutiveFailures++;
        if (consecutiveFailures >= 5 || areAllKeysUnavailable()) {
            markExhausted();
        }
        logRequest({
            id: requestId,
            timestamp: Date.now(),
            text: text.substring(0, 50),
            result: 'error',
            latencyMs: Date.now() - startTime,
            error: `HIGH_TRAFFIC_${tier.toUpperCase()}`
        });
        throw new Error(`HIGH_TRAFFIC_${tier.toUpperCase()}`);
    }

    const apiKey = API_KEYS[keyIndex];
    if (!apiKey) {
        logRequest({
            id: requestId,
            timestamp: Date.now(),
            text: text.substring(0, 50),
            result: 'error',
            latencyMs: Date.now() - startTime,
            error: 'NO_API_KEY',
            model: tier
        });
        throw new Error('NO_API_KEY');
    }

    // Build request
    const systemPrompt = PromptRegistry.getSystemPrompt(tier);
    const compiledMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: PromptRegistry.sandwichInput(text) }
    ];

    try {
        const payload = {
            model: tier === '8b' ? MODEL_8B : MODEL_70B,
            messages: compiledMessages,
            temperature: tier === '8b' ? 0 : 0.1,
            max_tokens: tier === '8b' ? 1024 : 2048
        };

        // Use fetchWithRetry instead of fetchWithTimeout
        const res = await fetchWithRetry(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }, timeoutMs);

        const endTime = Date.now();
        const latencyMs = endTime - startTime;

        // Handle 401 - Invalid key
        if (res.status === 401 || res.status === 403) {
            updateKeyStatus(keyIndex, false, res.status, `${res.status} Invalid Key`);
            logRequest({
                id: requestId,
                timestamp: Date.now(),
                text: text.substring(0, 50),
                result: 'error',
                latencyMs,
                error: 'INVALID_API_KEY',
                keyUsed: keyIndex,
                model: tier
            });
            if (retryCount < MAX_RETRIES && !areAllKeysDead()) {
                return executeCorrection(text, tier, requestId, retryCount + 1);
            }
            throw new Error('INVALID_API_KEY');
        }

        // Handle 429 - Rate limit
        if (res.status === 429) {
            updateKeyStatus(keyIndex, false, 429, '429 Rate Limited');
            consecutiveFailures++;

            if (consecutiveFailures >= 5) {
                markExhausted();
                throw new Error('API_EXHAUSTED');
            }

            if (retryCount < MAX_RETRIES && !areAllKeysUnavailable()) {
                console.log(`[Crystal] Rate limited, retrying in ${RETRY_DELAY_MS}ms`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
                return executeCorrection(text, tier, requestId, retryCount + 1);
            }

            logRequest({
                id: requestId,
                timestamp: Date.now(),
                text: text.substring(0, 50),
                result: 'error',
                latencyMs,
                error: 'RATE_LIMIT_EXCEEDED',
                keyUsed: keyIndex,
                model: tier
            });
            throw new Error('RATE_LIMIT_EXCEEDED');
        }

        // Handle other HTTP errors
        if (!res.ok) {
            updateKeyStatus(keyIndex, false, res.status, `HTTP ${res.status}`);

            if (retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                return executeCorrection(text, tier, requestId, retryCount + 1);
            }

            logRequest({
                id: requestId,
                timestamp: Date.now(),
                text: text.substring(0, 50),
                result: 'error',
                latencyMs,
                error: `API_ERROR_${res.status}`,
                keyUsed: keyIndex,
                model: tier
            });
            throw new Error(`API_ERROR_${res.status}`);
        }

        // Success!
        consecutiveFailures = 0;
        updateKeyStatus(keyIndex, true);

        const data = await res.json() as {
            choices?: { message?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const rawContent = data.choices?.[0]?.message?.content ?? "";
        const match = rawContent.match(/<<<START>>>([\s\S]*?)<<<END>>>/);
        const cleanedText = match?.[1]?.trim() ?? rawContent.trim();

        // Cache result
        await globalCache.set(cacheKey, cleanedText);

        // Log success
        logRequest({
            id: requestId,
            timestamp: Date.now(),
            text: text.substring(0, 50),
            result: 'success',
            latencyMs,
            keyUsed: keyIndex,
            model: tier
        });

        // Broadcast telemetry
        const usage = data.usage ?? {};
        const tokensIn = usage.prompt_tokens ?? Math.ceil(text.length / 4);
        const tokensOut = usage.completion_tokens ?? Math.ceil(cleanedText.length / 4);

        chrome.runtime.sendMessage({
            type: 'TELEMETRY_LOG',
            data: {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                workerId: `${keyIndex}-${tier}`,
                status: 'SUCCESS',
                tokensInput: tokensIn,
                tokensOutput: tokensOut,
                costUSD: tokensIn * (tier === '8b' ? PRICE_8B_IN : PRICE_70B_IN) + tokensOut * (tier === '8b' ? PRICE_8B_OUT : PRICE_70B_OUT)
            }
        }).catch(() => { });

        return { text: cleanedText, modelUsed: tier, cached: false };

    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';

        updateKeyStatus(keyIndex, false, undefined, errorMessage);

        if (errorMessage === 'REQUEST_TIMEOUT') {
            logRequest({
                id: requestId,
                timestamp: Date.now(),
                text: text.substring(0, 50),
                result: 'timeout',
                latencyMs: timeoutMs,
                error: `Timed out (${timeoutMs / 1000}s)`,
                keyUsed: keyIndex,
                model: tier
            });
        } else if (errorMessage === 'NETWORK_ERROR') {
            logRequest({
                id: requestId,
                timestamp: Date.now(),
                text: text.substring(0, 50),
                result: 'error',
                latencyMs: Date.now() - startTime,
                error: 'Network error after retries',
                keyUsed: keyIndex,
                model: tier
            });
        }

        throw e;
    }
}

// ============================================
// PUBLIC API (with deduplication)
// ============================================
export async function correctText(
    text: string,
    tier: ModelTier,
    requestId: string
): Promise<{ text: string; modelUsed: ModelTier; cached: boolean }> {
    // Cleanup expired pending requests
    cleanupExpiredPending();

    // Check for duplicate request
    const hash = getRequestHash(text, tier);
    const pending = pendingRequests.get(hash);

    if (pending) {
        console.log('[Crystal] Deduplicating request - reusing pending result');
        return pending.promise;
    }

    // Start new request
    const promise = executeCorrection(text, tier, requestId);

    // Track it
    pendingRequests.set(hash, {
        promise,
        timestamp: Date.now()
    });

    // Remove from pending when done
    promise.finally(() => {
        pendingRequests.delete(hash);
    });

    return promise;
}
