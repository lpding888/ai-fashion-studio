import { Controller, Get, Headers, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminLogService } from './admin-log.service';

const RecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(2000).default(200),
});

@Controller('admin/logs')
export class AdminLogController {
  constructor(private readonly logs: AdminLogService) {}

  @Get('recent')
  async recent(
    @Query(new ZodValidationPipe(RecentQuerySchema))
    query: z.infer<typeof RecentQuerySchema>,
  ) {
    return { success: true, items: this.logs.recent(query.limit) };
  }

  @Get('stream')
  async stream(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('authorization') _authorization?: string,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const anyRes = res as any;
    if (typeof anyRes.flushHeaders === 'function') {
      anyRes.flushHeaders();
    }

    const write = (obj: unknown) => {
      res.write(`${JSON.stringify(obj)}\n`);
    };

    const sub = this.logs.stream().subscribe((evt) => write(evt));
    const ping = setInterval(() => this.logs.ping(), 15000);

    req.on('close', () => {
      clearInterval(ping);
      sub.unsubscribe();
      try {
        res.end();
      } catch {
        // ignore
      }
    });

    write({ type: 'ping', ts: Date.now() });
  }
}
