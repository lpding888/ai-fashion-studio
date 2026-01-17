import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { AdminLogEvent, AdminLogLevel } from './admin-log.types';
import { sanitizeLogValue, safeStringifyLogMessage } from './log-sanitizer';

type LogRecord = Extract<AdminLogEvent, { type: 'log' }>;

@Injectable()
export class AdminLogService {
  private readonly maxRecords = 2000;
  private readonly subject = new Subject<AdminLogEvent>();

  private seq = 0;
  private buffer: LogRecord[] = [];

  stream() {
    return this.subject.asObservable();
  }

  recent(limit: number) {
    const effective = Math.max(1, Math.min(limit, this.maxRecords));
    return this.buffer.slice(-effective);
  }

  push(params: {
    level: AdminLogLevel;
    message: unknown;
    context?: string;
    meta?: Record<string, unknown>;
  }) {
    const safeMeta = sanitizeLogValue(params.meta || {});
    const normalizedMeta =
      safeMeta && typeof safeMeta === 'object' && !Array.isArray(safeMeta)
        ? (safeMeta as Record<string, unknown>)
        : { meta: safeMeta };

    const record: LogRecord = {
      type: 'log',
      id: ++this.seq,
      ts: Date.now(),
      level: params.level,
      context: params.context,
      message: this.stringifyMessage(params.message),
      meta: normalizedMeta,
    };

    this.buffer.push(record);
    if (this.buffer.length > this.maxRecords) {
      this.buffer = this.buffer.slice(-this.maxRecords);
    }

    this.subject.next(record);
  }

  ping() {
    this.subject.next({ type: 'ping', ts: Date.now() });
  }

  private stringifyMessage(message: unknown) {
    return safeStringifyLogMessage(message);
  }
}
