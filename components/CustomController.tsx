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
            if (response?.log) setRequestLog(response.log);
            if (response?.keyStatuses) setKeyStatuses(response.keyStatuses);
            if (typeof response?.hasApiKeys === 'boolean') setHasApiKeys(response.hasApiKeys);
        });
    }, []);

    useEffect(() => {
        loadData();

        const handleMessage = (message: { type: string; log?: RequestLogEntry[]; keyStatuses?: KeyStatus[] }) => {
            if (message.type === 'LOG_UPDATE') {
                if (message.log) setRequestLog(message.log);
                if (message.keyStatuses) setKeyStatuses(message.keyStatuses);
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

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

    const handleWorkerClick = (keyIndex: number) => {
        setEditingKeyIndex(keyIndex);
        setNewKeyValue('');
        setValidationError(null);
    };

    const saveNewKey = async () => {
        if (editingKeyIndex === null) return;
        const trimmedKey = newKeyValue.trim();
        if (!trimmedKey.startsWith('gsk_') || trimmedKey.length < 20) {
            setValidationError('Invalid format. Must start with "gsk_"');
            return;
        }

        setIsValidating(true);
        setValidationError(null);

        chrome.runtime.sendMessage({
            type: 'VALIDATE_API_KEY',
            key: trimmedKey
        }, (result) => {
            if (!result?.valid) {
                setValidationError(result?.error || 'Validation failed');
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

    const activeKeyCount = keyStatuses.filter(k => k.status !== 'empty').length;
    const isNoKeyState = !hasApiKeys && activeKeyCount === 0;

    if (hasApiKeys === null) {
        return (
            <div className="flex w-full h-full min-h-[500px] bg-[#000000] items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full min-h-[500px] bg-[#0A0A0A] text-white font-sans overflow-hidden">
            
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-5 border-b border-white/[0.05]">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        Crystal
                        {!power && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-white/10 text-white/50 tracking-normal">Offline</span>}
                    </h1>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={power} onChange={togglePower} />
                    <div className="w-[44px] h-[24px] bg-white/10 rounded-full peer peer-checked:bg-white transition-all duration-300">
                        <div className={`absolute top-[2px] left-[2px] w-[20px] h-[20px] rounded-full transition-all duration-300 shadow-sm ${power ? 'translate-x-[20px] bg-black' : 'bg-white/50'}`}></div>
                    </div>
                </label>
            </header>

            <main className={`flex-1 flex flex-col px-6 py-5 overflow-y-auto custom-scrollbar transition-opacity duration-300 ${!power ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                
                {/* Workers Section */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-sm font-semibold text-white/60 tracking-wide">Workers</h2>
                        <span className="text-sm font-medium text-white/40">{activeKeyCount} / 5</span>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: MAX_WORKERS }).map((_, i) => {
                            const status = keyStatuses[i] || { status: 'empty', keyIndex: i, successCount: 0, errorCount: 0 };
                            const isEmpty = status.status === 'empty';
                            const isDead = status.status === 'dead';

                            return (
                                <div
                                    key={i}
                                    onClick={() => handleWorkerClick(i)}
                                    className={`group relative h-14 flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all duration-200 border
                                        ${isEmpty ? 'bg-transparent border-white/10 hover:border-white/30 border-dashed' : 'bg-[#1C1C1E] border-white/5 hover:border-white/20 shadow-sm'}
                                    `}
                                >
                                    {isEmpty ? (
                                        <span className="text-lg font-light text-white/30">+</span>
                                    ) : (
                                        <>
                                            {/* Status Dot */}
                                            <div className={`w-2 h-2 rounded-full mb-1 ${
                                                status.status === 'ready' ? 'bg-[#34C759]' :
                                                status.status === 'cooldown' ? 'bg-[#FF9F0A]' :
                                                status.status === 'dead' ? 'bg-[#FF453A] animate-pulse' : 'bg-transparent'
                                            }`}></div>
                                            
                                            {/* Key Label */}
                                            <span className="text-xs font-semibold text-white/80">0{i + 1}</span>
                                        </>
                                    )}

                                    {/* Delete Button (Hover) */}
                                    {!isEmpty && (
                                        <button
                                            onClick={(e) => removeKey(i, e)}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#FF453A] text-white rounded-full flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all shadow-md z-10"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    {isNoKeyState && (
                        <div className="mt-4 p-4 rounded-xl bg-[#1C1C1E] border border-white/10">
                            <p className="text-sm text-white/70 mb-3 leading-relaxed">
                                Crystal requires a Groq API key to operate securely on your device.
                            </p>
                            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="block w-full py-2.5 bg-white text-black text-sm font-semibold rounded-lg text-center hover:bg-gray-200 transition-colors">
                                Get Free Key
                            </a>
                        </div>
                    )}
                </div>

                {/* Model Selector Section */}
                {!isNoKeyState && (
                    <div className="mb-8">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-sm font-semibold text-white/60 tracking-wide">AI Engine</h2>
                        </div>
                        <div className="flex p-1 bg-[#1C1C1E] rounded-xl border border-white/5">
                            {(['8b', 'auto', '70b'] as const).map((m) => (
                                <label key={m} className="flex-1 relative cursor-pointer z-10">
                                    <input className="sr-only peer" name="model" type="radio" value={m} checked={model === m} onChange={() => selectModel(m)} />
                                    <div className={`w-full py-2.5 text-center text-sm font-semibold rounded-lg transition-all duration-200 ${
                                        model === m 
                                        ? 'bg-[#3A3A3C] text-white shadow-sm' 
                                        : 'text-white/40 hover:text-white/70'
                                    }`}>
                                        {m === 'auto' ? 'Auto' : m.toUpperCase()}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex-1"></div>

                {/* Advanced / Developer */}
                <div className="border-t border-white/10 pt-4 pb-2">
                    <div className="flex items-center justify-between cursor-pointer group" onClick={toggleDebugMode}>
                        <span className="text-sm font-medium text-white/60 group-hover:text-white transition-colors">Developer Console</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white/40">{debugMode ? 'Active' : 'Hidden'}</span>
                            <svg className={`w-4 h-4 text-white/40 transition-transform ${debugMode ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Developer Log */}
                {debugMode && (
                    <div ref={logContainerRef} className="mt-2 p-3 bg-[#121214] border border-white/10 rounded-xl overflow-y-auto custom-scrollbar" style={{ height: '140px' }}>
                        <div className="flex justify-between items-center mb-3 sticky top-0 bg-[#121214] pb-2 border-b border-white/5">
                            <span className="text-xs font-mono font-medium text-white/50">System Log ({requestLog.length})</span>
                            <button onClick={clearLog} className="text-xs font-medium text-[#FF453A] hover:text-[#FF6961]">Clear</button>
                        </div>
                        {requestLog.length === 0 ? (
                            <div className="text-xs font-mono text-white/30 py-2">No activity recorded.</div>
                        ) : (
                            <div className="space-y-2 font-mono text-xs">
                                {requestLog.slice(-20).map((log, i) => (
                                    <div key={log.id || i} className="flex flex-wrap items-center gap-2">
                                        <span className={log.result === 'success' ? 'text-[#34C759]' : log.result === 'error' ? 'text-[#FF453A]' : 'text-white/40'}>
                                            [{log.result.substring(0, 3).toUpperCase()}]
                                        </span>
                                        <span className="text-white/40">{log.latencyMs}ms</span>
                                        {log.model && <span className="text-[#0A84FF]">{log.model.replace('llama-3.1-', '')}</span>}
                                        {log.keyUsed !== undefined && <span className="text-white/70">W0{log.keyUsed + 1}</span>}
                                        {log.error && <span className="text-[#FF453A] truncate flex-1">{log.error}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Key Entry Modal */}
            {editingKeyIndex !== null && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-6">
                    <div className="w-full bg-[#1C1C1E] border border-white/10 rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-base font-semibold text-white">
                                {keyStatuses[editingKeyIndex]?.status === 'empty' ? 'Add API Key' : 'Replace API Key'}
                            </h3>
                        </div>
                        <p className="text-sm text-white/50 mb-4">
                            Paste your free Groq API key for Slot 0{editingKeyIndex + 1}.
                        </p>
                        <input
                            type="password"
                            placeholder="gsk_..."
                            value={newKeyValue}
                            onChange={(e) => setNewKeyValue(e.target.value)}
                            className="w-full px-4 py-3 bg-[#0A0A0A] border border-white/10 rounded-xl text-base font-mono text-white placeholder-white/20 focus:outline-none focus:border-white/40 transition-colors mb-2"
                            disabled={isValidating}
                            autoFocus
                        />
                        <div className="h-5 mb-4">
                            {validationError && <p className="text-sm text-[#FF453A]">{validationError}</p>}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setEditingKeyIndex(null)}
                                disabled={isValidating}
                                className="flex-1 py-3 text-sm font-semibold bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveNewKey}
                                disabled={isValidating || !newKeyValue.trim()}
                                className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all ${
                                    isValidating || !newKeyValue.trim()
                                        ? 'bg-white/10 text-white/30 cursor-not-allowed'
                                        : 'bg-white text-black hover:bg-gray-200'
                                }`}
                            >
                                {isValidating ? 'Validating...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{__html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}} />
        </div>
    );
};
