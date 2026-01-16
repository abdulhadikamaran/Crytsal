/*
 * Request Logger Module
 * Handles debug logging and request history
 */

// ============================================
// TYPES
// ============================================
export interface RequestLogEntry {
    id: string;
    timestamp: number;
    text: string;
    result: 'success' | 'error' | 'cached' | 'no_change' | 'timeout';
    latencyMs: number;
    error?: string;
    keyUsed?: number;
    model?: string;
}

// ============================================
// STATE
// ============================================
const requestLog: RequestLogEntry[] = [];
const MAX_LOG_SIZE = 50;

// ============================================
// LOGGING
// ============================================
export function logRequest(entry: RequestLogEntry): void {
    requestLog.push(entry);

    // Keep only last N entries
    if (requestLog.length > MAX_LOG_SIZE) {
        requestLog.shift();
    }

    // Broadcast to popup (import keyStatuses dynamically to avoid circular dep)
    import('./KeyManager').then(({ getKeyStatuses }) => {
        chrome.runtime.sendMessage({
            type: 'LOG_UPDATE',
            log: requestLog,
            keyStatuses: getKeyStatuses()
        }).catch(() => { }); // Ignore if popup is closed
    });
}

// ============================================
// GETTERS
// ============================================
export function getRequestLog(): RequestLogEntry[] {
    return requestLog;
}

// ============================================
// MANAGEMENT
// ============================================
export function clearRequestLog(): void {
    requestLog.length = 0;
    chrome.storage.local.remove('requestLog');
}
