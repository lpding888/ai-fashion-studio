export type McpStatus = {
    name: string;
    version: string;
    tools: string[];
    toolCallCounts: Record<string, number>;
    lastToolCallAt?: number;
    lastConnectedAt?: number;
    hasActiveTransport: boolean;
    activeSessions?: number;
    sessionIds?: string[];
};

export type SseEvent = {
    ts: number;
    event: string;
    data: string;
    parsed?: unknown;
};
