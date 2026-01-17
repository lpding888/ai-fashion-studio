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
import { AuthService } from '../auth/auth.service';
import { UserDbService } from '../db/user-db.service';
import { ModelProfileKind, ModelProfileService } from './model-profile.service';

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
  async create(
    @Headers('authorization') authorization: string,
    @Body()
    body: {
      kind: ModelProfileKind;
      name: string;
      gateway: string;
      model: string;
      apiKey: string;
    },
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
  async update(
    @Headers('authorization') authorization: string,
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      gateway: string;
      model: string;
      apiKey: string;
      disabled: boolean;
    }>,
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
  async setActive(
    @Headers('authorization') authorization: string,
    @Body()
    body: {
      brainProfileId?: string;
      painterProfileId?: string;
      brainProfileIds?: string[];
      painterProfileIds?: string[];
    },
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      if (Array.isArray(body.brainProfileIds) && body.brainProfileIds.length > 0) {
        await this.profiles.setActivePool('BRAIN', body.brainProfileIds, admin);
      } else if (body.brainProfileId) {
        await this.profiles.setActive('BRAIN', body.brainProfileId, admin);
      }

      if (Array.isArray(body.painterProfileIds) && body.painterProfileIds.length > 0) {
        await this.profiles.setActivePool('PAINTER', body.painterProfileIds, admin);
      } else if (body.painterProfileId) {
        await this.profiles.setActive('PAINTER', body.painterProfileId, admin);
      }
      return { success: true };
    } catch (e: any) {
      throw new BadRequestException(e.message || '设置失败');
    }
  }

  @Post(':id/test')
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
