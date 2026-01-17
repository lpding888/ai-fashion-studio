export type AdminLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

export type AdminLogEvent =
  | {
      type: 'log';
      id: number;
      ts: number;
      level: AdminLogLevel;
      context?: string;
      message: string;
      meta?: Record<string, unknown>;
    }
  | {
      type: 'ping';
      ts: number;
    };

