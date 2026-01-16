
export type ModelTier = '8b' | '70b';
export type LaneStatus = 'READY' | 'COOLDOWN' | 'DRAINED';
export type WorkerStatus = 'IDLE' | 'BUSY' | 'COOLDOWN' | 'DRAINED';

export interface HighwayLane {
    rowId: number;
    key: string;
    tier: ModelTier;
    status: LaneStatus;
    tokenBudget: number;
    cooldownExpiry: number;
}

export interface ShardState {
    id: string;
    rowId: number;
    tier: '8b' | '70b';
    status: WorkerStatus;
    tokensRemaining: number;
    cooldownEnds?: number;
}

export interface GridTelemetry {
    type: 'GRID_UPDATE';
    shards: ShardState[];
    globalStats: {
        integrity: number;
        totalRequests: number;
        totalTokens: number;
        rpm: number;
    }
}
