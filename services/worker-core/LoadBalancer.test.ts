
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoadBalancer } from './LoadBalancer';

// Mock self.postMessage
const postMessageMock = vi.fn();
global.self = {
    postMessage: postMessageMock
} as any;

describe('LoadBalancer (CrystalDispatcher)', () => {
    let lb: LoadBalancer;

    beforeEach(() => {
        vi.useFakeTimers();
        postMessageMock.mockClear();
        lb = LoadBalancer.getInstance();

        // Reset internal state using "any" access to private properties
        // This is necessary because it's a singleton and we want fresh state for each test
        (lb as any).initializeMatrix();
        (lb as any).initializeStatuses();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should initialize with correct number of shards', () => {
        // Trigger a broadcast to check state
        lb.broadcast();

        expect(postMessageMock).toHaveBeenCalled();
        const telemetry = postMessageMock.mock.calls[0][0];

        expect(telemetry.type).toBe('GRID_UPDATE');
        // 5 keys * 2 tiers = 10 shards
        expect(telemetry.shards.length).toBe(10);
    });

    it('should distribute requests across available workers (Load Balancing)', () => {
        const counts = new Map<string, number>();
        const iterations = 100;

        for (let i = 0; i < iterations; i++) {
            const worker = lb.getWorker('8b');
            expect(worker).toBeDefined();
            const key = `${worker!.rowId}-8b`;
            counts.set(key, (counts.get(key) || 0) + 1);
        }

        // With 5 keys, we expect at least 2 distinct keys to be used
        // (Probabilistic check, but highly likely check passes with 100 attempts)
        expect(counts.size).toBeGreaterThan(1);
    });

    it('should trip circuit and prevent selection of COOLDOWN workers', () => {
        const worker = lb.getWorker('8b');
        expect(worker).toBeDefined();
        const targetRow = worker!.rowId;

        // Trip the circuit
        lb.tripCircuit(worker!);

        // Verify internal state confirms COOLDOWN
        expect(worker!.status).toBe('COOLDOWN');

        // Try to get a worker 50 times, ensure we NEVER get the cooldown worker
        for (let i = 0; i < 50; i++) {
            const w = lb.getWorker('8b');
            if (w) {
                expect(w.rowId).not.toBe(targetRow);
            }
        }
    });

    it('should recover worker status after cooldown expires', () => {
        const worker = lb.getWorker('8b')!;
        lb.tripCircuit(worker);

        expect(worker.status).toBe('COOLDOWN');

        // Advance time: 60s base + max 5s jitter
        vi.advanceTimersByTime(70000);

        // getWorker checks for expiry and recovers the lane
        // We will call it enough times to ensure we cycle through to it, or check internal state

        // Force a check on specific lane by accessing internal matrix
        const internalLane = (lb as any).stateMatrix[worker.rowId]['8b'];

        // Accessing getWorker triggers the cleanup logic
        lb.getWorker('8b');

        expect(internalLane.status).toBe('READY');
    });

    it('should mark worker as DRAINED if token budget drops below threshold', () => {
        const worker = lb.getWorker('70b')!;

        // Mock Headers: 100 tokens remaining (Threshold is 500)
        const headers = new Headers();
        headers.set('x-ratelimit-remaining-tokens', '100');

        lb.updateRadar(worker, headers);

        expect(worker.status).toBe('DRAINED');

        // Verify it is excluded from selection
        for (let i = 0; i < 20; i++) {
            const w = lb.getWorker('70b');
            if (w) expect(w.rowId).not.toBe(worker.rowId);
        }
    });

    it('should broadcast correct telemetry stats', () => {
        lb.reportSuccess(0, '8b', 1500);
        lb.reportSuccess(1, '70b', 2500);

        lb.broadcast();

        const lastCall = postMessageMock.mock.calls[postMessageMock.mock.calls.length - 1][0];

        expect(lastCall.globalStats.totalRequests).toBeGreaterThanOrEqual(2);
        expect(lastCall.globalStats.totalTokens).toBeGreaterThanOrEqual(4000);
    });
});
