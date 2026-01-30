import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { UserDbService } from '../db/user-db.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BrainRoutingService } from './brain-routing.service';
import { AdminBrainRoutingBodySchema } from '../contracts/api.schemas';
import { z } from 'zod';

@ApiTags('BrainRouting')
@ApiBearerAuth()
@Controller('admin/brain-routing')
export class BrainRoutingController {
  constructor(
    private readonly routing: BrainRoutingService,
    private readonly authService: AuthService,
    private readonly userDb: UserDbService,
  ) {}

  private async requireAdmin(authorization?: string) {
    const token = this.authService.extractTokenFromHeader(authorization);
    if (!token) throw new BadRequestException('未提供认证令牌');

    const payload = this.authService.verifyToken(token);
    if (!payload) throw new BadRequestException('令牌无效或已过期');

    const user = await this.userDb.getUserById(payload.userId);
    if (!user || user.role !== 'ADMIN')
      throw new BadRequestException('需要管理员权限');
    if (user.status !== 'ACTIVE')
      throw new BadRequestException(
        user.status === 'PENDING' ? '账户待管理员审核' : '账户已被禁用',
      );

    return { id: user.id, username: user.username };
  }

  @Get()
  @ApiOperation({ summary: '获取路由配置' })
  async get(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    try {
      const routing = await this.routing.getRouting();
      return { success: true, routing };
    } catch (e: any) {
      throw new BadRequestException(e.message || '读取失败');
    }
  }

  @Post()
  @ApiOperation({ summary: '更新路由配置' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        defaultBrainProfileId: { type: 'string', nullable: true },
        styleLearnProfileId: { type: 'string', nullable: true },
        poseLearnProfileId: { type: 'string', nullable: true },
        promptOptimizeProfileId: { type: 'string', nullable: true },
      },
    },
  })
  async update(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(AdminBrainRoutingBodySchema))
    body: z.infer<typeof AdminBrainRoutingBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const routing = await this.routing.updateRouting(body, admin);
      return { success: true, routing };
    } catch (e: any) {
      throw new BadRequestException(e.message || '更新失败');
    }
  }
}
