import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  getHealth() {
    return { ok: true };
  }
}
