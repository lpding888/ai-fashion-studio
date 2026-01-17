import type { LoggerService } from '@nestjs/common';
import { AdminLogService } from './admin-log.service';
import { sanitizeLogValue, safeStringifyLogMessage } from './log-sanitizer';

export class StreamLogger implements LoggerService {
  constructor(private readonly logs: AdminLogService) {}

  log(message: any, context?: string) {
    const safeMessage = sanitizeLogValue(message);
    console.log(this.format(context, safeMessage));
    this.logs.push({ level: 'log', message: safeMessage, context });
  }

  error(message: any, trace?: string, context?: string) {
    const safeMessage = sanitizeLogValue(message);
    const safeTrace = trace ? safeStringifyLogMessage(trace) : undefined;
    if (trace) {
      console.error(this.format(context, safeMessage), safeTrace);
      this.logs.push({ level: 'error', message: safeMessage, context, meta: { trace: safeTrace } });
      return;
    }
    console.error(this.format(context, safeMessage));
    this.logs.push({ level: 'error', message: safeMessage, context });
  }

  warn(message: any, context?: string) {
    const safeMessage = sanitizeLogValue(message);
    console.warn(this.format(context, safeMessage));
    this.logs.push({ level: 'warn', message: safeMessage, context });
  }

  debug(message: any, context?: string) {
    // eslint-disable-next-line no-console
    const safeMessage = sanitizeLogValue(message);
    console.debug(this.format(context, safeMessage));
    this.logs.push({ level: 'debug', message: safeMessage, context });
  }

  verbose(message: any, context?: string) {
    // eslint-disable-next-line no-console
    const safeMessage = sanitizeLogValue(message);
    console.info(this.format(context, safeMessage));
    this.logs.push({ level: 'verbose', message: safeMessage, context });
  }

  private format(context: string | undefined, message: any) {
    const text = safeStringifyLogMessage(message);
    return context ? `[${context}] ${text}` : text;
  }
}
