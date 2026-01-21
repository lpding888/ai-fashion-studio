import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { UserDbService } from '../db/user-db.service';
import {
  WorkflowPromptPack,
  WorkflowPromptService,
} from './workflow-prompt.service';

@Controller('admin/workflow-prompts')
export class WorkflowPromptController {
  constructor(
    private readonly promptStore: WorkflowPromptService,
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
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException(
        user.status === 'PENDING' ? '账户待管理员审核' : '账户已被禁用',
      );
    }

    return { id: user.id, username: user.username };
  }

  @Get('active')
  async getActive(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    const active = await this.promptStore.getActive();
    return { success: true, ...active };
  }

  @Get('versions')
  async listVersions(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    const versions = await this.promptStore.listVersions();
    return { success: true, versions };
  }

  @Get('versions/:versionId')
  async getVersion(
    @Headers('authorization') authorization: string,
    @Param('versionId') versionId: string,
  ) {
    await this.requireAdmin(authorization);
    const version = await this.promptStore.getVersion(versionId);
    if (!version) throw new BadRequestException('版本不存在');
    return { success: true, version };
  }

  @Post('versions')
  async createVersion(
    @Headers('authorization') authorization: string,
    @Body()
    body: { pack: WorkflowPromptPack; note?: string; publish?: boolean },
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const meta = await this.promptStore.createVersion(
        body.pack,
        admin,
        body.note,
        body.publish,
      );
      return { success: true, version: meta };
    } catch (e: any) {
      throw new BadRequestException(e.message || '创建版本失败');
    }
  }

  @Post('publish')
  async publish(
    @Headers('authorization') authorization: string,
    @Body() body: { versionId: string },
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const { version, ref } = await this.promptStore.publishVersion(
        body.versionId,
        admin,
      );
      const { pack: _pack, ...safeVersion } = version;
      return { success: true, ref, version: safeVersion };
    } catch (e: any) {
      throw new BadRequestException(e.message || '发布失败');
    }
  }
}
