import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { UserDbService } from '../db/user-db.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ModelProfileService } from './model-profile.service';
import {
  AdminCreateModelProfileBodySchema,
  AdminUpdateModelProfileBodySchema,
  AdminSetActiveModelProfileBodySchema,
} from '../contracts/api.schemas';
import { z } from 'zod';

@ApiTags('ModelProfiles')
@ApiBearerAuth()
@Controller('admin/model-profiles')
export class ModelProfileController {
  constructor(
    private readonly profiles: ModelProfileService,
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
  @ApiOperation({ summary: '获取模型配置列表' })
  async list(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    try {
      const data = await this.profiles.list();
      return { success: true, ...data };
    } catch (e: any) {
      throw new BadRequestException(e.message || '读取失败');
    }
  }

  @Post()
  @ApiOperation({ summary: '创建模型配置' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['BRAIN', 'PAINTER'] },
        provider: { type: 'string', enum: ['GEMINI', 'OPENAI_COMPAT'] },
        name: { type: 'string' },
        gateway: { type: 'string' },
        model: { type: 'string' },
        apiKey: { type: 'string' },
      },
      required: ['kind', 'name', 'gateway', 'model', 'apiKey'],
    },
  })
  async create(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(AdminCreateModelProfileBodySchema))
    body: z.infer<typeof AdminCreateModelProfileBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const created = await this.profiles.create(body, admin);
      return { success: true, profile: created };
    } catch (e: any) {
      throw new BadRequestException(e.message || '创建失败');
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新模型配置' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['GEMINI', 'OPENAI_COMPAT'] },
        name: { type: 'string' },
        gateway: { type: 'string' },
        model: { type: 'string' },
        apiKey: { type: 'string' },
        disabled: { type: 'boolean' },
      },
    },
  })
  async update(
    @Headers('authorization') authorization: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminUpdateModelProfileBodySchema))
    body: z.infer<typeof AdminUpdateModelProfileBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const updated = await this.profiles.update(id, body, admin);
      return { success: true, profile: updated };
    } catch (e: any) {
      throw new BadRequestException(e.message || '更新失败');
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除模型配置' })
  @ApiParam({ name: 'id', type: String })
  async remove(
    @Headers('authorization') authorization: string,
    @Param('id') id: string,
  ) {
    await this.requireAdmin(authorization);
    try {
      await this.profiles.remove(id);
      return { success: true };
    } catch (e: any) {
      throw new BadRequestException(e.message || '删除失败');
    }
  }

  @Post('set-active')
  @ApiOperation({ summary: '设置激活模型' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        brainProfileId: { type: 'string' },
        painterProfileId: { type: 'string' },
        brainProfileIds: { type: 'array', items: { type: 'string' } },
        painterProfileIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async setActive(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(AdminSetActiveModelProfileBodySchema))
    body: z.infer<typeof AdminSetActiveModelProfileBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      if (
        Array.isArray(body.brainProfileIds) &&
        body.brainProfileIds.length > 0
      ) {
        await this.profiles.setActivePool('BRAIN', body.brainProfileIds, admin);
      } else if (body.brainProfileId) {
        await this.profiles.setActive('BRAIN', body.brainProfileId, admin);
      }

      if (
        Array.isArray(body.painterProfileIds) &&
        body.painterProfileIds.length > 0
      ) {
        await this.profiles.setActivePool(
          'PAINTER',
          body.painterProfileIds,
          admin,
        );
      } else if (body.painterProfileId) {
        await this.profiles.setActive('PAINTER', body.painterProfileId, admin);
      }
      return { success: true };
    } catch (e: any) {
      throw new BadRequestException(e.message || '设置失败');
    }
  }

  @Post(':id/test')
  @ApiOperation({ summary: '测试模型配置连通性' })
  @ApiParam({ name: 'id', type: String })
  async test(
    @Headers('authorization') authorization: string,
    @Param('id') id: string,
  ) {
    await this.requireAdmin(authorization);
    try {
      const result = await this.profiles.testProfile(id);
      return { success: true, result };
    } catch (e: any) {
      throw new BadRequestException(e.message || '测试失败');
    }
  }
}
