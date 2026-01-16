/*
 * CRYSTAL BACKGROUND BRAIN (Chrome Service Worker)
 * Refactored: Modular architecture with clean separation of concerns
 * Features: API key validation, state persistence, keep-alive, health check
 * Updated: Requires user to provide their own API keys, 5 worker slots
 */

import { API_URL, hasApiKeys, getActiveKeyCount } from '../services/worker-core/config';
import { ModelTier } from '../services/worker-core/types';
import { SemanticRouter } from '../services/worker-core/SemanticRouter';
import { correctText, isExhausted, getExhaustionEndTime, resetExhaustion } from '../services/worker-core/ApiClient';
import {
  loadCustomKeys,
  getKeyStatuses,
  updateUserApiKey,
  removeUserApiKey,
  areAllKeysDead,
  forcePersist,
  healthCheck,
  hasNoApiKeys
} from '../services/worker-core/KeyManager';
import { getRequestLog, clearRequestLog, logRequest } from '../services/worker-core/RequestLogger';

// ============================================
// CACHED SETTINGS (#4 - Avoid storage reads)
// ============================================
let cachedModelPreference: 'auto' | '8b' | '70b' = 'auto';

// Load on startup
chrome.storage.local.get(['modelPreference'], (result) => {
  if (result.modelPreference === '8b' || result.modelPreference === '70b') {
    cachedModelPreference = result.modelPreference;
  }
});

// Update on change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.modelPreference) {
    const newVal = changes.modelPreference.newValue;
    if (newVal === '8b' || newVal === '70b' || newVal === 'auto') {
      cachedModelPreference = newVal;
    }
  }
});

// ============================================
// INITIALIZATION
// ============================================
loadCustomKeys().then(() => {
  const keyCount = getActiveKeyCount();
  console.log(`[Crystal] Background initialized. ${keyCount}/5 API key(s) active.`);
  if (keyCount === 0) {
    console.log('[Crystal] No API keys configured. User needs to add their key in the popup.');
  }
});

// ============================================
// KEEP-ALIVE ALARM (#2 - Cold Start Prevention)
// ============================================
const KEEP_ALIVE_ALARM_NAME = 'crystal-keep-alive';
const HEALTH_CHECK_ALARM_NAME = 'crystal-health-check';

// Create alarms on startup
chrome.alarms.create(KEEP_ALIVE_ALARM_NAME, {
  periodInMinutes: 0.4 // Every 24 seconds (before 30s timeout)
});

chrome.alarms.create(HEALTH_CHECK_ALARM_NAME, {
  periodInMinutes: 5 // Every 5 minutes
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM_NAME) {
    // Just a heartbeat to keep the worker alive
    console.log('[Crystal] Keep-alive heartbeat');
  }

  if (alarm.name === HEALTH_CHECK_ALARM_NAME) {
    // Run health check (#3)
    runHealthCheck();
  }
});

// ============================================
// HEALTH CHECK / SELF-HEALING (#3)
// ============================================
async function runHealthCheck(): Promise<void> {
  console.log('[Crystal] Running health check...');

  // 1. Reset exhaustion if it's been too long (5+ minutes)
  if (isExhausted()) {
    const exhaustionEnd = getExhaustionEndTime();
    if (exhaustionEnd && Date.now() > exhaustionEnd + (5 * 60 * 1000)) {
      console.log('[Crystal] Health check: Resetting stale exhaustion');
      resetExhaustion();
    }
  }

  // 2. Check if all keys are dead but network is available
  if (!hasNoApiKeys() && areAllKeysDead() && navigator.onLine) {
    console.log('[Crystal] Health check: All keys dead, testing recovery...');
    await healthCheck();
  }

  // 3. Persist any dirty state
  forcePersist();

  console.log('[Crystal] Health check complete');
}

// ============================================
// API KEY VALIDATION (#11)
// ============================================
async function validateApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
  console.log('[Crystal] Validating API key...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      })
    });

    if (res.status === 401 || res.status === 403) {
      console.log('[Crystal] API key validation failed: Invalid key');
      return { valid: false, error: 'Invalid API key' };
    }

    if (res.status === 429) {
      // Rate limited means the key is valid
      console.log('[Crystal] API key validation: Valid (rate limited)');
      return { valid: true };
    }

    if (res.ok) {
      console.log('[Crystal] API key validation: Valid');
      return { valid: true };
    }

    console.log(`[Crystal] API key validation failed: HTTP ${res.status}`);
    return { valid: false, error: `HTTP ${res.status}` };
  } catch (e) {
    console.log('[Crystal] API key validation failed: Network error');
    return { valid: false, error: 'Network error' };
  }
}

// ============================================
// MESSAGE HANDLER
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // CORRECT_TEXT - Main correction request
  if (request.type === "CORRECT_TEXT") {
    console.log("[Crystal] Processing text:", request.text?.substring(0, 30) + "...");

    // Check if we have any API keys
    if (hasNoApiKeys()) {
      console.log("[Crystal] No API keys configured");

      // Log this request
      logRequest({
        id: "req-" + Date.now(),
        timestamp: Date.now(),
        text: request.text?.substring(0, 50) || '',
        result: 'error',
        latencyMs: 0,
        error: 'No API key configured'
      });

      sendResponse({
        success: false,
        error: 'No API key configured. Please add your Groq API key in the extension popup.',
        errorType: 'no_key'
      });
      return true;
    }

    // Use cached model preference (#4 - no storage read)
    let tier: ModelTier = '8b';
    if (cachedModelPreference === '8b') tier = '8b';
    else if (cachedModelPreference === '70b') tier = '70b';
    else tier = SemanticRouter.route(request.text);

    console.log(`[Crystal] Routing: Mode=${cachedModelPreference}, Model=${tier}`);

    const requestId = "req-" + Date.now();

    correctText(request.text, tier, requestId)
      .then(result => {
        const noChange = result.text.trim() === request.text.trim();

        sendResponse({
          success: true,
          corrected: result.text,
          cached: result.cached,
          noChange
        });
      })
      .catch((err: Error) => {
        console.error("[Crystal] Correction Failed:", err.message);

        sendResponse({
          success: false,
          error: err.message,
          errorType: getErrorType(err.message)
        });
      });

    return true;
  }

  // GET_STATUS - Extension status
  if (request.type === "GET_STATUS") {
    const noKeys = hasNoApiKeys();
    sendResponse({
      success: true,
      status: noKeys ? 'no_key' : areAllKeysDead() ? 'all_dead' : isExhausted() ? 'exhausted' : 'active',
      exhaustionEnds: getExhaustionEndTime(),
      keyStatuses: getKeyStatuses(),
      hasApiKeys: !noKeys
    });
    return true;
  }

  // GET_REQUEST_LOG - Debug log
  if (request.type === "GET_REQUEST_LOG") {
    const log = getRequestLog();
    console.log(`[Crystal] Sending log with ${log.length} entries`);
    sendResponse({
      success: true,
      log,
      keyStatuses: getKeyStatuses(),
      hasApiKeys: !hasNoApiKeys()
    });
    return true;
  }

  // CLEAR_REQUEST_LOG - Clear debug log
  if (request.type === "CLEAR_REQUEST_LOG") {
    clearRequestLog();
    console.log('[Crystal] Request log cleared');
    sendResponse({ success: true });
    return true;
  }

  // VALIDATE_API_KEY - Test key before saving (#11)
  if (request.type === "VALIDATE_API_KEY") {
    const { key } = request as { type: string; key: string };
    validateApiKey(key).then(result => {
      sendResponse(result);
    });
    return true;
  }

  // UPDATE_API_KEY - User adds/replaces a key at a specific slot
  if (request.type === "UPDATE_API_KEY") {
    const { keyIndex, newKey } = request as { type: string; keyIndex: number; newKey: string };
    console.log(`[Crystal] Adding/Updating API key at slot ${keyIndex + 1}...`);
    updateUserApiKey(keyIndex, newKey).then(() => {
      console.log('[Crystal] API key saved successfully');
      sendResponse({ success: true, keyStatuses: getKeyStatuses() });
    });
    return true;
  }

  // REMOVE_API_KEY - User removes a key from a slot
  if (request.type === "REMOVE_API_KEY") {
    const { keyIndex } = request as { type: string; keyIndex: number };
    console.log(`[Crystal] Removing API key from slot ${keyIndex + 1}...`);
    removeUserApiKey(keyIndex).then(() => {
      sendResponse({ success: true, keyStatuses: getKeyStatuses() });
    });
    return true;
  }

  // RESET_API_KEY - Legacy, same as remove
  if (request.type === "RESET_API_KEY") {
    const { keyIndex } = request as { type: string; keyIndex: number };
    removeUserApiKey(keyIndex).then(() => {
      sendResponse({ success: true, keyStatuses: getKeyStatuses() });
    });
    return true;
  }

  // FORCE_PERSIST - Save state now
  if (request.type === "FORCE_PERSIST") {
    forcePersist();
    sendResponse({ success: true });
    return true;
  }

  // HEALTH_CHECK - Manual trigger
  if (request.type === "HEALTH_CHECK") {
    runHealthCheck().then(() => {
      sendResponse({ success: true, keyStatuses: getKeyStatuses() });
    });
    return true;
  }

  return false;
});

// ============================================
// HELPER
// ============================================
function getErrorType(message: string): string {
  if (message.includes('ALL_KEYS_DEAD')) return 'all_dead';
  if (message.includes('EXHAUSTED')) return 'exhausted';
  if (message.includes('TIMEOUT')) return 'timeout';
  if (message.includes('NETWORK')) return 'network';
  if (message.includes('INVALID')) return 'invalid_key';
  if (message.includes('RATE_LIMIT')) return 'rate_limit';
  if (message.includes('HIGH_TRAFFIC')) return 'high_traffic';
  if (message.includes('No API key') || message.includes('NO_API_KEY')) return 'no_key';
  return 'unknown';
}
