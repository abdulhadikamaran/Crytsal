import React, { useEffect, useState, useCallback, useRef } from 'react';

type ModelPreference = 'auto' | '8b' | '70b';

interface KeyStatus {
    keyIndex: number;
    status: 'ready' | 'cooldown' | 'dead' | 'empty';
    lastError?: string;
    lastUsed?: number;
    successCount: number;
    errorCount: number;
    cooldownUntil?: number;
    maskedKey?: string;
}

interface RequestLogEntry {
    id: string;
    timestamp: number;
    text: string;
    result: 'success' | 'error' | 'cached' | 'no_change' | 'timeout';
    latencyMs: number;
    error?: string;
    keyUsed?: number;
    model?: string;
}

const MAX_WORKERS = 5;

export const CustomController: React.FC = () => {
    const [power, setPower] = useState(true);
    const [model, setModel] = useState<ModelPreference>('auto');
    const [debugMode, setDebugMode] = useState(false);
    const [requestLog, setRequestLog] = useState<RequestLogEntry[]>([]);
    const [keyStatuses, setKeyStatuses] = useState<KeyStatus[]>([]);
    const [hasApiKeys, setHasApiKeys] = useState<boolean | null>(null);

    // Key editing state
    const [editingKeyIndex, setEditingKeyIndex] = useState<number | null>(null);
    const [newKeyValue, setNewKeyValue] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const logContainerRef = useRef<HTMLDivElement>(null);

    const loadData = useCallback(() => {
        chrome.storage.local.get(['extensionEnabled', 'modelPreference', 'debugMode'], (result) => {
            if (typeof result.extensionEnabled === 'boolean') setPower(result.extensionEnabled);
            if (result.modelPreference === '8b' || result.modelPreference === 'auto' || result.modelPreference === '70b') {
                setModel(result.modelPreference);
            }
            if (typeof result.debugMode === 'boolean') setDebugMode(result.debugMode);
        });

        chrome.runtime.sendMessage({ type: 'GET_REQUEST_LOG' }, (response) => {
            console.log('[Popup] Got response:', response);
            if (response?.log) {
                console.log('[Popup] Log entries:', response.log.length);
                setRequestLog(response.log);
            }
            if (response?.keyStatuses) setKeyStatuses(response.keyStatuses);
            if (typeof response?.hasApiKeys === 'boolean') setHasApiKeys(response.hasApiKeys);
        });
    }, []);

    useEffect(() => {
        loadData();

        const handleMessage = (message: { type: string; log?: RequestLogEntry[]; keyStatuses?: KeyStatus[] }) => {
            if (message.type === 'LOG_UPDATE') {
                console.log('[Popup] LOG_UPDATE received:', message.log?.length);
                if (message.log) setRequestLog(message.log);
                if (message.keyStatuses) setKeyStatuses(message.keyStatuses);
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        // Poll for updates
        const interval = setInterval(() => {
            chrome.runtime.sendMessage({ type: 'GET_REQUEST_LOG' }, (response) => {
                if (response?.log) setRequestLog(response.log);
                if (response?.keyStatuses) setKeyStatuses(response.keyStatuses);
                if (typeof response?.hasApiKeys === 'boolean') setHasApiKeys(response.hasApiKeys);
            });
        }, 1500);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);
            clearInterval(interval);
        };
    }, [loadData]);

    // Auto-scroll when log updates
    useEffect(() => {
        if (logContainerRef.current && debugMode) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [requestLog, debugMode]);

    const togglePower = () => {
        const newState = !power;
        setPower(newState);
        chrome.storage.local.set({ extensionEnabled: newState });
    };

    const selectModel = (mode: ModelPreference) => {
        if (!power) return;
        setModel(mode);
        chrome.storage.local.set({ modelPreference: mode });
    };

    const toggleDebugMode = () => {
        const newState = !debugMode;
        setDebugMode(newState);
        chrome.storage.local.set({ debugMode: newState });
        if (newState) loadData();
    };

    const clearLog = () => {
        chrome.runtime.sendMessage({ type: 'CLEAR_REQUEST_LOG' });
        setRequestLog([]);
    };

    // Handle clicking on a worker slot
    const handleWorkerClick = (keyIndex: number) => {
        setEditingKeyIndex(keyIndex);
        setNewKeyValue('');
        setValidationError(null);
    };

    // Save new API key with validation
    const saveNewKey = async () => {
        if (editingKeyIndex === null) return;

        const trimmedKey = newKeyValue.trim();
        if (!trimmedKey.startsWith('gsk_') || trimmedKey.length < 20) {
            setValidationError('Invalid format. Keys start with "gsk_" and are longer.');
            return;
        }

        setIsValidating(true);
        setValidationError(null);

        chrome.runtime.sendMessage({
            type: 'VALIDATE_API_KEY',
            key: trimmedKey
        }, (result) => {
            if (!result?.valid) {
                setValidationError(result?.error || 'Key validation failed');
                setIsValidating(false);
                return;
            }

            chrome.runtime.sendMessage({
                type: 'UPDATE_API_KEY',
                keyIndex: editingKeyIndex,
                newKey: trimmedKey
            }, (response) => {
                setIsValidating(false);
                if (response?.success) {
                    if (response.keyStatuses) setKeyStatuses(response.keyStatuses);
                    setHasApiKeys(true);
                    setEditingKeyIndex(null);
                    setNewKeyValue('');
                }
            });
        });
    };

    // Remove a key
    const removeKey = (keyIndex: number, e: React.MouseEvent) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
            type: 'REMOVE_API_KEY',
            keyIndex
        }, (response) => {
            if (response?.success && response.keyStatuses) {
                setKeyStatuses(response.keyStatuses);
                const hasKeys = response.keyStatuses.some((k: KeyStatus) => k.status !== 'empty');
                setHasApiKeys(hasKeys);
            }
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ready': return 'bg-green-500';
            case 'cooldown': return 'bg-yellow-500';
            case 'dead': return 'bg-red-600';
            case 'empty': return 'bg-gray-300 border-2 border-dashed border-gray-400';
            default: return 'bg-gray-400';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'ready': return 'Ready';
            case 'cooldown': return 'Cooldown';
            case 'dead': return 'Invalid';
            case 'empty': return 'Empty';
            default: return status;
        }
    };

    const getResultColor = (result: string) => {
        switch (result) {
            case 'success': return 'text-green-500';
            case 'cached': return 'text-blue-500';
            case 'no_change': return 'text-gray-500';
            case 'timeout': return 'text-orange-500';
            case 'error': return 'text-red-500';
            default: return 'text-gray-500';
        }
    };

    const getResultIcon = (result: string) => {
        switch (result) {
            case 'success': return '✓';
            case 'cached': return '⚡';
            case 'no_change': return '=';
            case 'timeout': return '⏱';
            case 'error': return '✗';
            default: return '?';
        }
    };

    const activeKeyCount = keyStatuses.filter(k => k.status !== 'empty').length;
    const isNoKeyState = !hasApiKeys && activeKeyCount === 0;

    // Loading state
    if (hasApiKeys === null) {
        return (
            <div className="flex flex-col w-full h-full p-3 bg-gray-100/50">
                <div className="w-full h-full bg-white rounded-2xl shadow-soft overflow-hidden border border-gray-100 flex items-center justify-center">
                    <div className="text-gray-400 text-sm">Loading...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full p-3 bg-gray-100/50">
            <div className="w-full h-full bg-white rounded-2xl shadow-soft overflow-hidden border border-gray-100 flex flex-col transition-all duration-300">
                <header className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                    <h1 className="text-gray-900 text-base font-bold tracking-tight">Crystal AI</h1>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={power}
                            onChange={togglePower}
                        />
                        <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#66cc88]"></div>
                    </label>
                </header>

                <main className="flex-1 flex flex-col px-4 py-2 overflow-y-auto">
                    <div className={`flex flex-col gap-3 transition-opacity duration-300 ${!power ? 'opacity-50 pointer-events-none' : ''}`}>

                        {/* 5 Worker Slots */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Workers ({activeKeyCount}/5)</span>
                                {isNoKeyState && (
                                    <a
                                        href="https://console.groq.com/keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[9px] text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1"
                                    >
                                        Get API Key ↗
                                    </a>
                                )}
                            </div>

                            {/* Worker Grid */}
                            <div className="grid grid-cols-5 gap-2">
                                {Array.from({ length: MAX_WORKERS }).map((_, i) => {
                                    const status = keyStatuses[i] || { status: 'empty', keyIndex: i, successCount: 0, errorCount: 0 };
                                    const isEmpty = status.status === 'empty';
                                    const isDead = status.status === 'dead';

                                    return (
                                        <div
                                            key={i}
                                            onClick={() => handleWorkerClick(i)}
                                            className={`relative cursor-pointer transition-all hover:scale-105 ${isEmpty || isDead ? 'opacity-100' : ''}`}
                                            title={`Worker ${i + 1}: ${getStatusText(status.status)}${status.maskedKey ? `\nKey: ...${status.maskedKey}` : ''}\nSuccess: ${status.successCount} | Errors: ${status.errorCount}${status.lastError ? `\nError: ${status.lastError}` : ''}`}
                                        >
                                            <div className={`h-8 rounded-lg flex items-center justify-center ${getStatusColor(status.status)} transition-all ${isDead ? 'animate-pulse' : ''}`}>
                                                {isEmpty ? (
                                                    <span className="text-gray-400 text-lg">+</span>
                                                ) : (
                                                    <span className="text-white text-[10px] font-bold">{i + 1}</span>
                                                )}
                                            </div>
                                            {/* Masked key display */}
                                            {status.maskedKey && (
                                                <span className="absolute -bottom-3.5 left-0 right-0 text-[7px] text-gray-400 text-center truncate">
                                                    ...{status.maskedKey}
                                                </span>
                                            )}
                                            {/* Remove button for non-empty slots */}
                                            {!isEmpty && (
                                                <button
                                                    onClick={(e) => removeKey(i, e)}
                                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[8px] opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Legend */}
                            <div className="flex justify-center gap-3 mt-4 text-[8px] text-gray-400">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>Ready</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span>Cooldown</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600"></span>Invalid</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 border border-gray-400"></span>Empty</span>
                            </div>

                            {/* No API keys warning */}
                            {isNoKeyState && (
                                <div className="mt-3 space-y-2">
                                    <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
                                        <p className="text-[10px] text-blue-700 text-center">
                                            Click any worker slot to add your Groq API key
                                        </p>
                                    </div>

                                    {/* Get Free API Key */}
                                    <div className="p-2 bg-green-50 rounded-lg border border-green-200">
                                        <p className="text-[10px] text-green-700 text-center font-medium mb-1">
                                            🎁 Get a FREE API key in 30 seconds:
                                        </p>
                                        <a
                                            href="https://console.groq.com/keys"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block w-full py-1.5 bg-green-500 hover:bg-green-600 text-white text-[10px] font-medium rounded text-center transition-colors"
                                        >
                                            Get Free Key at Groq Console →
                                        </a>
                                        <p className="text-[8px] text-green-600 text-center mt-1">
                                            Sign up, create a key, then paste it in a worker slot
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Key Editor Modal */}
                        {editingKeyIndex !== null && (
                            <div className="p-3 bg-gray-900 rounded-lg border border-gray-700">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-white text-xs font-semibold">
                                        Worker {editingKeyIndex + 1} - {keyStatuses[editingKeyIndex]?.status === 'empty' ? 'Add Key' : 'Replace Key'}
                                    </span>
                                    <button
                                        onClick={() => setEditingKeyIndex(null)}
                                        className="text-gray-400 hover:text-white text-xs"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <p className="text-[9px] text-gray-400 mb-2">
                                    Get your free API key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">console.groq.com/keys</a>
                                </p>
                                <input
                                    type="password"
                                    placeholder="gsk_xxxxxxxxxxxxx..."
                                    value={newKeyValue}
                                    onChange={(e) => setNewKeyValue(e.target.value)}
                                    className="w-full px-2 py-2 text-xs bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                    disabled={isValidating}
                                    autoFocus
                                />
                                {validationError && (
                                    <p className="text-[9px] text-red-400 mt-1">{validationError}</p>
                                )}
                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={saveNewKey}
                                        disabled={isValidating || !newKeyValue.trim()}
                                        className={`flex-1 py-2 text-xs font-semibold rounded transition-colors flex items-center justify-center gap-1 ${isValidating || !newKeyValue.trim()
                                            ? 'bg-gray-600 text-gray-400 cursor-wait'
                                            : 'bg-green-600 hover:bg-green-700 text-white'
                                            }`}
                                    >
                                        {isValidating ? (
                                            <>
                                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Validating...
                                            </>
                                        ) : (
                                            'Save Key'
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setEditingKeyIndex(null)}
                                        disabled={isValidating}
                                        className="px-4 py-2 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Model Selector */}
                        {!isNoKeyState && (
                            <div>
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Model</span>
                                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${power ? 'text-[#66cc88] bg-[#66cc88]/10' : 'text-gray-400 bg-gray-100'}`}>
                                        {power ? 'Active' : 'Offline'}
                                    </span>
                                </div>

                                <div className="flex p-1 bg-[#f8f9fa] rounded-xl border border-gray-100">
                                    {(['8b', 'auto', '70b'] as const).map((m) => (
                                        <label key={m} className="flex-1 relative cursor-pointer">
                                            <input
                                                className="sr-only peer"
                                                name="model"
                                                type="radio"
                                                value={m}
                                                checked={model === m}
                                                onChange={() => selectModel(m)}
                                            />
                                            <div className={`w-full py-2 text-center text-xs font-semibold text-gray-500 rounded-lg transition-all peer-checked:shadow-sm ${m === 'auto'
                                                ? 'peer-checked:bg-[#66cc88] peer-checked:text-white'
                                                : 'peer-checked:bg-white peer-checked:text-gray-900'
                                                }`}>
                                                {m === 'auto' ? 'Auto' : m}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Debug Mode Toggle */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            <span className="text-[10px] text-gray-400">Debug Log</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={debugMode}
                                    onChange={toggleDebugMode}
                                />
                                <div className="w-7 h-3.5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:start-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-blue-500"></div>
                            </label>
                        </div>

                        {/* Debug Log View - Compact */}
                        {debugMode && (
                            <div
                                ref={logContainerRef}
                                className="p-2 bg-gray-900 rounded-lg overflow-hidden"
                                style={{ maxHeight: '120px' }}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-gray-400 text-[10px] font-medium">Log ({requestLog.length})</span>
                                    <button
                                        onClick={clearLog}
                                        className="text-red-400 hover:text-red-300 text-[9px]"
                                    >
                                        Clear
                                    </button>
                                </div>

                                <div className="overflow-y-auto" style={{ maxHeight: '90px' }}>
                                    {requestLog.length === 0 ? (
                                        <div className="text-gray-500 text-[9px] py-1 text-center">
                                            No requests yet. Press Shift+A to fix text.
                                        </div>
                                    ) : (
                                        <div className="space-y-0.5 font-mono text-[9px]">
                                            {requestLog.slice(-20).map((log, i) => (
                                                <div key={log.id || i} className="flex items-center gap-1 py-0.5">
                                                    <span className={`${getResultColor(log.result)}`}>
                                                        {getResultIcon(log.result)}
                                                    </span>
                                                    <span className={`font-semibold ${getResultColor(log.result)}`}>
                                                        {log.result.substring(0, 3).toUpperCase()}
                                                    </span>
                                                    <span className="text-gray-500">{log.latencyMs}ms</span>
                                                    {log.model && (
                                                        <span className="text-blue-400">{log.model}</span>
                                                    )}
                                                    {log.keyUsed !== undefined && (
                                                        <span className="text-gray-600">W{log.keyUsed + 1}</span>
                                                    )}
                                                    {log.error && (
                                                        <span className="text-red-400 truncate flex-1">{log.error}</span>
                                                    )}
                                                    <span className="text-gray-700 ml-auto">
                                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </main>

                {/* Privacy Footer */}
                <footer className="px-4 py-1.5 border-t border-gray-100 flex items-center justify-center gap-1">
                    <svg className="w-2.5 h-2.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[8px] text-gray-400">Your keys are stored locally only. Text sent to Groq.</span>
                </footer>
            </div>
        </div>
    );
};
