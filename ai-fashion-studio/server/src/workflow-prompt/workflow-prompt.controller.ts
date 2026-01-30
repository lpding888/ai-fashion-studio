import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from '../auth/auth.service';
import { UserDbService } from '../db/user-db.service';
import { WorkflowPromptService } from './workflow-prompt.service';
import {
  CreateWorkflowPromptBodySchema,
  PublishWorkflowPromptBodySchema,
  WorkflowPromptActiveResponseSchema,
  WorkflowPromptListResponseSchema,
  WorkflowPromptGetVersionResponseSchema,
  WorkflowPromptCreateVersionResponseSchema,
  WorkflowPromptPublishResponseSchema,
} from '../contracts/api.schemas';
import { z } from 'zod';
import { assertResponse } from '../common/response-contract';

@ApiTags('WorkflowPrompts')
@ApiBearerAuth()
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
  @ApiOperation({ summary: '获取当前生效版本' })
  async getActive(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    const active = await this.promptStore.getActive();
    return assertResponse(
      WorkflowPromptActiveResponseSchema,
      { success: true, ...active },
      'WorkflowPromptController.getActive',
    );
  }

  @Get('versions')
  @ApiOperation({ summary: '获取版本列表' })
  async listVersions(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    const versions = await this.promptStore.listVersions();
    return assertResponse(
      WorkflowPromptListResponseSchema,
      { success: true, versions },
      'WorkflowPromptController.listVersions',
    );
  }

  @Get('versions/:versionId')
  @ApiOperation({ summary: '获取指定版本' })
  @ApiParam({ name: 'versionId', type: String })
  async getVersion(
    @Headers('authorization') authorization: string,
    @Param('versionId') versionId: string,
  ) {
    await this.requireAdmin(authorization);
    const version = await this.promptStore.getVersion(versionId);
    if (!version) throw new BadRequestException('版本不存在');
    return assertResponse(
      WorkflowPromptGetVersionResponseSchema,
      { success: true, version },
      'WorkflowPromptController.getVersion',
    );
  }

  @Post('versions')
  @ApiOperation({ summary: '创建版本' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pack: { type: 'object' },
        note: { type: 'string' },
        publish: { type: 'boolean' },
      },
      required: ['pack'],
    },
  })
  async createVersion(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(CreateWorkflowPromptBodySchema))
    body: z.infer<typeof CreateWorkflowPromptBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const meta = await this.promptStore.createVersion(
        body.pack,
        admin,
        body.note,
        body.publish,
      );
      return assertResponse(
        WorkflowPromptCreateVersionResponseSchema,
        { success: true, version: meta },
        'WorkflowPromptController.createVersion',
      );
    } catch (e: any) {
      throw new BadRequestException(e.message || '创建版本失败');
    }
  }

  @Post('publish')
  @ApiOperation({ summary: '发布版本' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { versionId: { type: 'string' } },
      required: ['versionId'],
    },
  })
  async publish(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(PublishWorkflowPromptBodySchema))
    body: z.infer<typeof PublishWorkflowPromptBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const { version, ref } = await this.promptStore.publishVersion(
        body.versionId,
        admin,
      );
      const { pack: _pack, ...safeVersion } = version;
      return assertResponse(
        WorkflowPromptPublishResponseSchema,
        { success: true, ref, version: safeVersion },
        'WorkflowPromptController.publish',
      );
    } catch (e: any) {
      throw new BadRequestException(e.message || '发布失败');
    }
  }
}
