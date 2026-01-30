import { Controller, Get, Headers, Query, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminLogService } from './admin-log.service';
import { AdminLogsRecentQuerySchema } from '../contracts/api.schemas';
import { z } from 'zod';

@ApiTags('AdminLogs')
@ApiBearerAuth()
@Controller('admin/logs')
export class AdminLogController {
  constructor(private readonly logs: AdminLogService) {}

  @Get('recent')
  @ApiOperation({ summary: '获取最近日志' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async recent(
    @Query(new ZodValidationPipe(AdminLogsRecentQuerySchema))
    query: z.infer<typeof AdminLogsRecentQuerySchema>,
  ) {
    return { success: true, items: this.logs.recent(query.limit) };
  }

  @Get('stream')
  @ApiOperation({ summary: '日志流（NDJSON）' })
  @ApiProduces('application/x-ndjson')
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
