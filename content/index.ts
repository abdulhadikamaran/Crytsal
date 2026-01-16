/*
 * CRYSTAL CONTENT SCRIPT (Vanilla JS)
 * Lightweight keyboard-driven text correction
 * Features: TTL cache with periodic cleanup (#1 Memory Leak Fix)
 */

// ============================================
// STATE
// ============================================
let isEnabled = true;
let isLoading = false;
let lastFixedHash: string | null = null;

// ============================================
// TTL CACHE (Memory Leak Fix #1)
// ============================================
interface CacheEntry {
    value: string;
    timestamp: number;
}
const localCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000; // Cleanup every 1 minute

function cleanupExpiredCache(): void {
    const now = Date.now();
    let deleted = 0;
    for (const [key, entry] of localCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL_MS) {
            localCache.delete(key);
            deleted++;
        }
    }
    if (deleted > 0) {
        console.log(`[Crystal] Cache cleanup: removed ${deleted} expired entries`);
    }
}

// Start periodic cleanup
setInterval(cleanupExpiredCache, CACHE_CLEANUP_INTERVAL_MS);

// Border timeout tracking
let borderTimeoutId: number | null = null;
let originalOutline = '';
let originalTransition = '';

// ============================================
// HELPERS
// ============================================
function hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function flashBorder(el: HTMLElement, color: string, duration: number = 500): void {
    if (borderTimeoutId) {
        clearTimeout(borderTimeoutId);
        borderTimeoutId = null;
    }

    if (!originalOutline && !el.style.outline.includes('solid')) {
        originalOutline = el.style.outline;
        originalTransition = el.style.transition;
    }

    el.style.transition = 'outline 0.15s ease';
    el.style.outline = `2px solid ${color}`;

    if (duration < 5000) {
        borderTimeoutId = window.setTimeout(() => {
            el.style.outline = originalOutline;
            el.style.transition = originalTransition;
            originalOutline = '';
            originalTransition = '';
            borderTimeoutId = null;
        }, duration);
    }
}

function getCursorPosition(el: HTMLElement): number {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        return (el as HTMLInputElement).selectionStart || 0;
    }
    return 0;
}

function setCursorPosition(el: HTMLElement, pos: number): void {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const input = el as HTMLInputElement;
        const maxPos = input.value.length;
        const safePos = Math.min(pos, maxPos);
        input.setSelectionRange(safePos, safePos);
    }
}

function getText(el: HTMLElement): string {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        return (el as HTMLInputElement).value;
    }
    return el.innerText;
}

function setText(el: HTMLElement, text: string): void {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        (el as HTMLInputElement).value = text;
    } else {
        el.innerText = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ============================================
// CORE FIX FUNCTION
// ============================================
async function doFix(el: HTMLElement): Promise<void> {
    if (isLoading) {
        console.log('[Crystal] Already processing...');
        return;
    }

    let targetText = '';
    let isSelection = false;
    let startPos = 0;
    let endPos = 0;

    // 1. Determine text to fix (Selection vs Full)
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const input = el as HTMLInputElement;
        startPos = input.selectionStart || 0;
        endPos = input.selectionEnd || 0;

        if (startPos !== endPos) {
            targetText = input.value.substring(startPos, endPos);
            isSelection = true;
        } else {
            targetText = input.value;
        }
    } else if (el.isContentEditable) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (el.contains(range.commonAncestorContainer)) {
                targetText = selection.toString();
                isSelection = true;
            }
        }
        if (!isSelection) {
            targetText = el.innerText;
        }
    } else {
        targetText = el.innerText;
    }

    if (!targetText.trim()) {
        console.log('[Crystal] No text to fix.');
        return;
    }

    // 2. Validation
    // Only enforce word count if grabbing full text.
    // If user explicitly selects text, we respect it even if it's short.
    if (!isSelection && countWords(targetText) < 3) {
        console.log('[Crystal] Too short (less than 3 words).');
        flashBorder(el, '#9ca3af', 300);
        return;
    }

    const currentHash = hashText(targetText.trim());
    if (currentHash === lastFixedHash) {
        console.log('[Crystal] Already fixed, skipping.');
        flashBorder(el, '#9ca3af', 300);
        return;
    }

    if (!navigator.onLine) {
        console.log('[Crystal] Offline.');
        flashBorder(el, '#3b82f6', 500);
        return;
    }

    // 3. Check Cache
    const cached = localCache.get(currentHash);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log('[Crystal] Cache hit (0ms)');

        if (isSelection) {
            // Partial Replace
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                const input = el as HTMLInputElement;
                input.setRangeText(cached.value, startPos, endPos, 'select');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (el.isContentEditable) {
                document.execCommand('insertText', false, cached.value);
            }
        } else {
            // Full Replace
            const cursorPos = getCursorPosition(el);
            setText(el, cached.value);
            setCursorPosition(el, cursorPos);
        }

        lastFixedHash = hashText(cached.value.trim());
        flashBorder(el, '#66cc88', 400);
        return;
    }

    // 4. API Call
    isLoading = true;
    flashBorder(el, '#f59e0b', 10000);

    // Save cursor logic only needed for full replace
    const savedCursorPos = getCursorPosition(el);

    try {
        const response = await chrome.runtime.sendMessage({
            type: "CORRECT_TEXT",
            text: targetText
        });

        if (response && response.success) {
            if (response.noChange) {
                console.log('[Crystal] No changes needed.');
                flashBorder(el, '#9ca3af', 400);
                isLoading = false;
                return;
            }

            // 5. Apply Changes
            if (isSelection) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    const input = el as HTMLInputElement;
                    // setRangeText replaces the selection. 'select' keeps new text highlighted.
                    input.setRangeText(response.corrected, startPos, endPos, 'select');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                } else if (el.isContentEditable) {
                    // execCommand is deprecated but reliable for contentEditable text insertion
                    document.execCommand('insertText', false, response.corrected);
                }
            } else {
                setText(el, response.corrected);
                setCursorPosition(el, savedCursorPos);
            }

            lastFixedHash = hashText(response.corrected.trim());

            // Add to TTL cache
            localCache.set(currentHash, {
                value: response.corrected,
                timestamp: Date.now()
            });

            // Enforce size limit
            if (localCache.size > MAX_CACHE_SIZE) {
                const firstKey = localCache.keys().next().value;
                if (firstKey) localCache.delete(firstKey);
            }

            flashBorder(el, '#66cc88', 500);
        } else {
            const errorType = response?.errorType || 'unknown';
            console.error('[Crystal] Error:', response?.error);

            if (errorType === 'no_key') {
                // No API key configured - flash blue to indicate setup needed
                console.log('[Crystal] No API key configured. Please add your key in the extension popup.');
                flashBorder(el, '#3b82f6', 1500); // Blue flash
            } else if (errorType === 'exhausted' || errorType === 'all_dead') {
                flashBorder(el, '#ef4444', 1000);
            } else if (errorType === 'rate_limit' || errorType === 'high_traffic') {
                flashBorder(el, '#f97316', 500);
            } else {
                flashBorder(el, '#ef4444', 500);
            }
        }
    } catch (err) {
        console.error('[Crystal] Error:', err);
        flashBorder(el, '#ef4444', 500);
    } finally {
        isLoading = false;
    }
}

// ============================================
// DEBOUNCE
// ============================================
let debounceTimeout: number | null = null;
const DEBOUNCE_MS = 300;

function debouncedFix(el: HTMLElement): void {
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }
    debounceTimeout = window.setTimeout(() => {
        doFix(el);
    }, DEBOUNCE_MS);
}

// ============================================
// EVENT HANDLERS
// ============================================
// Undo state
let lastOriginalText: string | null = null;
let lastUndoEl: HTMLElement | null = null;

function handleUndo(el: HTMLElement): void {
    if (!lastOriginalText || lastUndoEl !== el) {
        console.log('[Crystal] Nothing to undo for this element.');
        flashBorder(el, '#9ca3af', 300);
        return;
    }

    setText(el, lastOriginalText);
    flashBorder(el, '#ef4444', 400); // Red flash for undo
    console.log('[Crystal] Undid last change.');

    // Clear undo history so you can't undo twice
    lastOriginalText = null;
    lastUndoEl = null;
}

// ============================================
// EVENT HANDLERS
// ============================================
function handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();

    // Check for Shift+A (Fix) or Shift+Q (Undo)
    if (!e.shiftKey || (key !== 'a' && key !== 'q')) return;

    const el = document.activeElement as HTMLElement;
    if (!el) return;

    const isEditable =
        el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text') ||
        el.isContentEditable;

    if (!isEditable) return;

    e.preventDefault();
    e.stopPropagation();

    if (!isEnabled) {
        console.log('[Crystal] Extension disabled.');
        return;
    }

    if (key === 'q') {
        handleUndo(el);
    } else {
        // Save state before fixing
        // Note: For now, simple undo only works for full text replacements or if we track selection carefully.
        // To keep it simple and robust for the MVP: we save the WHOLE text of the element.
        lastOriginalText = getText(el);
        lastUndoEl = el;

        debouncedFix(el);
    }
}

function handleInput(): void {
    lastFixedHash = null;
}

// ============================================
// INITIALIZATION
// ============================================
function init(): void {
    try {
        chrome.storage.local.get(['extensionEnabled'], (res) => {
            isEnabled = res.extensionEnabled !== false;
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.extensionEnabled) {
                isEnabled = changes.extensionEnabled.newValue !== false;
            }
        });
    } catch (e) {
        console.log('[Crystal] Extension context issue.');
    }

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('input', handleInput, true);

    console.log('[Crystal] Content script loaded (vanilla JS)');
}

// Start
init();
