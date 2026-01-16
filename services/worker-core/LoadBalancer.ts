
import { ModelTier, HighwayLane, WorkerStatus, ShardState, GridTelemetry } from './types';
import { API_KEYS } from './config';

export class LoadBalancer {
    private static instance: LoadBalancer;
    private stateMatrix: Record<number, Record<ModelTier, HighwayLane>> = {};
    private shardStatuses: Map<string, WorkerStatus> = new Map();
    private totalRequests = 0;
    private totalTokens = 0;
    private recentRequests: number[] = [];

    private constructor() {
        this.initializeMatrix();
        this.initializeStatuses();
    }

    public static getInstance(): LoadBalancer {
        if (!LoadBalancer.instance) {
            LoadBalancer.instance = new LoadBalancer();
        }
        return LoadBalancer.instance;
    }

    private initializeMatrix() {
        API_KEYS.forEach((key, rowId) => {
            this.stateMatrix[rowId] = {
                '8b': { rowId, key, tier: '8b', status: 'READY', tokenBudget: 20000, cooldownExpiry: 0 },
                '70b': { rowId, key, tier: '70b', status: 'READY', tokenBudget: 20000, cooldownExpiry: 0 }
            };
        });
    }

    private initializeStatuses() {
        for (let i = 0; i < API_KEYS.length; i++) {
            this.shardStatuses.set(`${i}-8b`, 'IDLE');
            this.shardStatuses.set(`${i}-70b`, 'IDLE');
        }
    }

    public restoreState(payload: { totalRequests: number, totalTokens: number }) {
        if (payload) {
            this.totalRequests = payload.totalRequests || 0;
            this.totalTokens = payload.totalTokens || 0;
        }
        this.broadcast();
    }

    public getWorker(tier: ModelTier): HighwayLane | null {
        const now = Date.now();
        const available: HighwayLane[] = [];

        for (let row = 0; row < API_KEYS.length; row++) {
            const lane = this.stateMatrix[row][tier];
            // Recover from cooldown
            if (lane.status !== 'READY' && now > lane.cooldownExpiry) {
                lane.status = 'READY';
                lane.cooldownExpiry = 0;
                this.updateStatus(row, tier, 'IDLE');
            }
            if (lane.status === 'READY') available.push(lane);
        }

        if (available.length === 0) return null;

        // Random Load Balancing
        const idx = Math.floor(Math.random() * available.length);
        const selected = available[idx];
        this.updateStatus(selected.rowId, tier, 'BUSY');

        return selected;
    }

    public updateRadar(lane: HighwayLane, headers: Headers) {
        const remaining = headers.get('x-ratelimit-remaining-tokens');
        if (remaining) {
            lane.tokenBudget = parseInt(remaining, 10);
            if (lane.tokenBudget < 500) {
                lane.status = 'DRAINED';
                lane.cooldownExpiry = Date.now() + 30000;
                this.updateStatus(lane.rowId, lane.tier, 'DRAINED');
            }
        }
    }

    public tripCircuit(lane: HighwayLane) {
        lane.status = 'COOLDOWN';
        const jitter = Math.random() * 5000;
        lane.cooldownExpiry = Date.now() + 60000 + jitter;
        this.updateStatus(lane.rowId, lane.tier, 'COOLDOWN', lane.cooldownExpiry);
    }

    public updateStatus(rowId: number, tier: ModelTier, status: WorkerStatus, cooldownEnds?: number) {
        this.shardStatuses.set(`${rowId}-${tier}`, status);
        this.broadcast();
    }

    public reportSuccess(rowId: number, tier: ModelTier, tokensUsed: number) {
        this.totalRequests++;
        this.totalTokens += tokensUsed;
        this.recentRequests.push(Date.now());
        this.updateStatus(rowId, tier, 'IDLE');
    }

    public broadcast() {
        const now = Date.now();
        this.recentRequests = this.recentRequests.filter(t => t > now - 60000);

        const shards: ShardState[] = [];
        let onlineCount = 0;

        for (let i = 0; i < API_KEYS.length; i++) {
            (['8b', '70b'] as const).forEach(tier => {
                const lane = this.stateMatrix[i][tier];
                const status = this.shardStatuses.get(`${i}-${tier}`) || 'IDLE';
                const isCooldown = lane.status === 'COOLDOWN' || lane.status === 'DRAINED';

                if (!isCooldown) onlineCount++;

                shards.push({
                    id: tier === '8b' ? `Flash Node ${i + 1}` : `Deep Core ${i + 1}`,
                    rowId: i,
                    tier,
                    status: isCooldown ? (lane.status as WorkerStatus) : status,
                    tokensRemaining: lane.tokenBudget,
                    cooldownEnds: isCooldown ? lane.cooldownExpiry : undefined
                });
            });
        }


        const telemetry: GridTelemetry = {
            type: 'GRID_UPDATE',
            shards,
            globalStats: {
                integrity: Math.round((onlineCount / (API_KEYS.length * 2)) * 100),
                totalRequests: this.totalRequests,
                totalTokens: this.totalTokens,
                rpm: this.recentRequests.length
            }
        };

        // Extension: Telemetry Broadcast
        try {
            chrome.runtime.sendMessage(telemetry).catch(() => { });
        } catch (e) { /* Popup likely closed */ }
    }
}

export const loadBalancer = LoadBalancer.getInstance();
