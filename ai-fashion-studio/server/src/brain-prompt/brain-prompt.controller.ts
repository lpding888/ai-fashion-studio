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
import { DbService } from '../db/db.service';
import { BrainService } from '../brain/brain.service';
import { BrainPromptService } from './brain-prompt.service';
import {
  BrainPromptCreateVersionBodySchema,
  BrainPromptPublishBodySchema,
  BrainPromptAbCompareBodySchema,
  BrainPromptActiveResponseSchema,
  BrainPromptListResponseSchema,
  BrainPromptGetVersionResponseSchema,
  BrainPromptCreateVersionResponseSchema,
  BrainPromptPublishResponseSchema,
  BrainPromptAbCompareResponseSchema,
} from '../contracts/api.schemas';
import { z } from 'zod';
import { assertResponse } from '../common/response-contract';

@ApiTags('BrainPrompts')
@ApiBearerAuth()
@Controller('admin/brain-prompts')
export class BrainPromptController {
  constructor(
    private readonly promptStore: BrainPromptService,
    private readonly authService: AuthService,
    private readonly userDb: UserDbService,
    private readonly db: DbService,
    private readonly brain: BrainService,
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

  @Get('active')
  @ApiOperation({ summary: '获取当前生效版本' })
  async getActive(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    const active = await this.promptStore.getActive();
    return assertResponse(
      BrainPromptActiveResponseSchema,
      { success: true, ...active },
      'BrainPromptController.getActive',
    );
  }

  @Get('versions')
  @ApiOperation({ summary: '获取版本列表' })
  async listVersions(@Headers('authorization') authorization: string) {
    await this.requireAdmin(authorization);
    const versions = await this.promptStore.listVersions();
    return assertResponse(
      BrainPromptListResponseSchema,
      { success: true, versions },
      'BrainPromptController.listVersions',
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
      BrainPromptGetVersionResponseSchema,
      { success: true, version },
      'BrainPromptController.getVersion',
    );
  }

  @Post('versions')
  @ApiOperation({ summary: '创建版本' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        note: { type: 'string' },
        publish: { type: 'boolean' },
      },
      required: ['content'],
    },
  })
  async createVersion(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(BrainPromptCreateVersionBodySchema))
    body: z.infer<typeof BrainPromptCreateVersionBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const meta = await this.promptStore.createVersion(
        body.content,
        admin,
        body.note,
        body.publish,
      );
      if (body.publish) {
        const created = await this.promptStore.getVersion(meta.versionId);
        if (created) this.brain.setSystemPrompt(created.content);
      }
      return assertResponse(
        BrainPromptCreateVersionResponseSchema,
        { success: true, version: meta },
        'BrainPromptController.createVersion',
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
    @Body(new ZodValidationPipe(BrainPromptPublishBodySchema))
    body: z.infer<typeof BrainPromptPublishBodySchema>,
  ) {
    const admin = await this.requireAdmin(authorization);
    try {
      const { version, ref } = await this.promptStore.publishVersion(
        body.versionId,
        admin,
      );
      this.brain.setSystemPrompt(version.content);
      const { content: _content, ...safeVersion } = version;
      return assertResponse(
        BrainPromptPublishResponseSchema,
        { success: true, ref, version: safeVersion },
        'BrainPromptController.publish',
      );
    } catch (e: any) {
      throw new BadRequestException(e.message || '发布失败');
    }
  }

  @Post('ab-compare')
  @ApiOperation({ summary: 'A/B 对照测试' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        versionA: { type: 'string' },
        versionB: { type: 'string' },
      },
      required: ['taskId', 'versionA', 'versionB'],
    },
  })
  async abCompare(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(BrainPromptAbCompareBodySchema))
    body: z.infer<typeof BrainPromptAbCompareBodySchema>,
  ) {
    await this.requireAdmin(authorization);

    const task = await this.db.getTask(body.taskId);
    if (!task) throw new BadRequestException('任务不存在');

    const vA = await this.promptStore.getVersion(body.versionA);
    const vB = await this.promptStore.getVersion(body.versionB);
    if (!vA) throw new BadRequestException('版本A不存在');
    if (!vB) throw new BadRequestException('版本B不存在');

    const imagePaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];

    const options = {
      shot_count: task.shotCount,
      layout_mode: task.layoutMode,
      location: task.location,
      style_direction: task.styleDirection,
      style_ref_paths: task.styleRefPaths,
      face_ref_paths: faceRefPaths,
      model_metadata: task.modelMetadata,
    };

    try {
      const [a, b] = await Promise.all([
        this.brain.planTask(
          imagePaths,
          task.requirements,
          options as any,
          task.config,
          vA.content,
        ),
        this.brain.planTask(
          imagePaths,
          task.requirements,
          options as any,
          task.config,
          vB.content,
        ),
      ]);

      const response = {
        success: true,
        metaA: {
          versionId: vA.versionId,
          sha256: vA.sha256,
          createdAt: vA.createdAt,
          note: vA.note,
          createdBy: vA.createdBy,
        },
        metaB: {
          versionId: vB.versionId,
          sha256: vB.sha256,
          createdAt: vB.createdAt,
          note: vB.note,
          createdBy: vB.createdBy,
        },
        planA: a.plan,
        thinkingA: a.thinkingProcess,
        planB: b.plan,
        thinkingB: b.thinkingProcess,
      };
      return assertResponse(
        BrainPromptAbCompareResponseSchema,
        response,
        'BrainPromptController.abCompare',
      );
    } catch (e: any) {
      throw new BadRequestException(e.message || 'A/B 对照失败');
    }
  }
}
