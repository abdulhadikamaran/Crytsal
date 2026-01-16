import Dexie, { Table } from 'dexie';

export interface TelemetryLog {
    id: string;                 // UUID
    timestamp: number;          // Epoch

    // 1. Worker Identity
    workerId: string;           // "key_0-8b"
    keyIndex: number;           // 0-4
    modelLane: '8b' | '70b';

    // 2. Metrics
    tokensInput: number;
    tokensOutput: number;
    latencyMs: number;
    ttftMs?: number;

    // 3. Status
    status: 'SUCCESS' | 'RATE_LIMIT' | 'NETWORK_ERROR';
    ratelimitRemaining: number;

    // 4. Financials
    costUSD: number;
}

export interface GlobalStats {
    id: 'main'; // Singleton row
    totalRequests: number;
    totalCost: number;
    totalTokens: number;
}

export class CrystalDB extends Dexie {
    telemetryLogs!: Table<TelemetryLog>;
    globalStats!: Table<GlobalStats>;

    constructor() {
        super('CrystalDB');

        // Version 1
        this.version(1).stores({
            telemetryLogs: 'id, timestamp, workerId, status, modelLane'
        });

        // Version 2: Add Global Stats
        this.version(2).stores({
            globalStats: 'id'
        });
    }

    // Helper: Atomic Increment
    async incrementStats(cost: number, tokens: number) {
        await this.transaction('rw', this.globalStats, async () => {
            const current = await this.globalStats.get('main');
            if (current) {
                await this.globalStats.update('main', {
                    totalRequests: current.totalRequests + 1,
                    totalCost: current.totalCost + cost,
                    totalTokens: current.totalTokens + tokens
                });
            } else {
                await this.globalStats.add({
                    id: 'main',
                    totalRequests: 1,
                    totalCost: cost,
                    totalTokens: tokens
                });
            }
        });
    }

    // Helper: Fast Read
    async getStats() {
        const stats = await this.globalStats.get('main');
        return stats || { totalRequests: 0, totalCost: 0, totalTokens: 0 };
    }
}

export const db = new CrystalDB();

