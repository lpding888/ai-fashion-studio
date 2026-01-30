import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
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
import { HeroStoryboardService } from './hero-storyboard.service';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { TaskAccessService } from './task-access.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  EditHeroBodySchema,
  SelectHeroVariantBodySchema,
  UpdateShootLogBodySchema,
  UpdateStoryboardShotBodySchema,
  HeroStoryboardTaskResponseSchema,
} from '../contracts/api.schemas';
import { assertResponse } from '../common/response-contract';
import { normalizeTaskResponse } from './task-response';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class HeroStoryboardController {
  constructor(
    private readonly heroStoryboard: HeroStoryboardService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  private resolveErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }

  /**
   * 人工确认 Hero，并生成分镜动作卡（Phase 2）
   */
  @Post(':id/hero/confirm')
  @ApiOperation({ summary: '确认 Hero 并生成分镜卡' })
  @ApiParam({ name: 'id', type: String })
  async confirmHero(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.confirmHero(taskId);
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.confirmHero',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '确认Hero失败'),
      );
    }
  }

  /**
   * 重新生成 Hero 母版（不需要重建任务）
   */
  @Post(':id/hero/regenerate')
  @ApiOperation({ summary: '重新生成 Hero 母版' })
  @ApiParam({ name: 'id', type: String })
  async regenerateHero(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.regenerateHero(taskId);
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.regenerateHero',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '重新生成Hero失败'),
      );
    }
  }

  /**
   * 编辑 Hero 的 Shoot Log（手账）
   */
  @Patch(':id/hero/shoot-log')
  @ApiOperation({ summary: '更新 Hero 手账' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { shootLogText: { type: 'string' } },
    },
  })
  async updateHeroShootLog(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(UpdateShootLogBodySchema))
    body: z.infer<typeof UpdateShootLogBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.updateHeroShootLog(
        taskId,
        body.shootLogText,
      );
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.updateHeroShootLog',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '保存手账失败'),
      );
    }
  }

  /**
   * 局部编辑 Hero 母版（mask inpaint）
   */
  @Post(':id/hero/edit')
  @ApiOperation({ summary: '编辑 Hero 母版' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        maskImage: { type: 'string' },
        referenceImages: { type: 'array', items: { type: 'string' } },
        prompt: { type: 'string' },
        editMode: { type: 'string' },
      },
      required: ['maskImage', 'prompt'],
    },
  })
  async editHero(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(EditHeroBodySchema))
    body: z.infer<typeof EditHeroBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.editHero(taskId, body);
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.editHero',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '编辑母版失败'),
      );
    }
  }

  /**
   * 选择某个 Hero 历史版本作为当前母版
   */
  @Post(':id/hero/select')
  @ApiOperation({ summary: '选择 Hero 历史版本' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { attemptCreatedAt: { type: 'number' } },
      required: ['attemptCreatedAt'],
    },
  })
  async selectHeroVariant(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(SelectHeroVariantBodySchema))
    body: z.infer<typeof SelectHeroVariantBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.selectHeroVariant(
        taskId,
        body.attemptCreatedAt,
      );
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.selectHeroVariant',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '选择母版版本失败'),
      );
    }
  }

  /**
   * 单镜头生成（Phase 3）
   */
  @Post(':id/storyboard/shots/:index/render')
  @ApiOperation({ summary: '生成单镜头' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'index', type: String })
  async renderShot(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('index') index: string,
  ) {
    const parsed = Number(index);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('index 参数无效');
    }
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.renderShot(taskId, parsed);
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.renderShot',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '生成镜头失败'),
      );
    }
  }

  /**
   * 选择某个镜头的某个版本（用于“姿势裂变”：下一镜头会以该版本作为上一帧）
   */
  @Post(':id/storyboard/shots/:index/select')
  @ApiOperation({ summary: '选择镜头版本' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'index', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { attemptCreatedAt: { type: 'number' } },
      required: ['attemptCreatedAt'],
    },
  })
  async selectShotVariant(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('index') index: string,
    @Body() body: { attemptCreatedAt?: number },
  ) {
    const parsedIndex = Number(index);
    if (!Number.isFinite(parsedIndex) || parsedIndex <= 0) {
      throw new BadRequestException('index 参数无效');
    }
    const attemptCreatedAt = Number(body?.attemptCreatedAt);
    if (!Number.isFinite(attemptCreatedAt) || attemptCreatedAt <= 0) {
      throw new BadRequestException('attemptCreatedAt 参数无效');
    }

    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.selectShotVariant(
        taskId,
        parsedIndex,
        attemptCreatedAt,
      );
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.selectShotVariant',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '选择镜头版本失败'),
      );
    }
  }

  /**
   * 四镜头拼图生成（Phase 3）
   */
  @Post(':id/storyboard/render-grid')
  @ApiOperation({ summary: '生成四镜头拼图' })
  @ApiParam({ name: 'id', type: String })
  async renderGrid(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.renderGrid(taskId);
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.renderGrid',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '生成拼图失败'),
      );
    }
  }

  /**
   * 编辑四镜头拼图的 Shoot Log（手账）
   */
  @Patch(':id/storyboard/grid/shoot-log')
  @ApiOperation({ summary: '更新拼图手账' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { shootLogText: { type: 'string' } },
    },
  })
  async updateGridShootLog(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(UpdateShootLogBodySchema))
    body: z.infer<typeof UpdateShootLogBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.updateGridShootLog(
        taskId,
        body.shootLogText,
      );
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.updateGridShootLog',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '保存拼图手账失败'),
      );
    }
  }

  /**
   * 重新生成分镜规划（重新抽卡），不需要重做 Hero
   */
  @Post(':id/storyboard/replan')
  @ApiOperation({ summary: '重新生成分镜规划' })
  @ApiParam({ name: 'id', type: String })
  async replanStoryboard(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.replanStoryboard(taskId);
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.replanStoryboard',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '重新生成分镜失败'),
      );
    }
  }

  /**
   * 修改某个镜头的规划文字（不重新抽卡，不重新出图；保存后可再点“重新生成该镜头”生效）
   */
  @Patch(':id/storyboard/shots/:index')
  @ApiOperation({ summary: '更新分镜文案' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'index', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        patch: { type: 'object', additionalProperties: true },
      },
      required: ['patch'],
    },
  })
  async updateStoryboardShot(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('index') index: string,
    @Body() body: unknown,
  ) {
    const parsedIndex = Number(index);
    if (!Number.isFinite(parsedIndex) || parsedIndex <= 0) {
      throw new BadRequestException('index 参数无效');
    }

    await this.taskAccess.requireWritableTask(taskId, user);
    const parsedResult = UpdateStoryboardShotBodySchema.safeParse(body);
    if (!parsedResult.success) {
      throw new BadRequestException(
        this.resolveErrorMessage(parsedResult.error, '请求体格式错误'),
      );
    }
    const parsedBody: z.infer<typeof UpdateStoryboardShotBodySchema> =
      parsedResult.data;

    try {
      const result = await this.heroStoryboard.updateStoryboardShot(
        taskId,
        parsedIndex,
        parsedBody.patch,
      );
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.updateStoryboardShot',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '保存镜头文字失败'),
      );
    }
  }

  /**
   * 编辑某个镜头的 Shoot Log（手账）（不影响图片，仅用于展示/记录）
   */
  @Patch(':id/storyboard/shots/:index/shoot-log')
  @ApiOperation({ summary: '更新分镜手账' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'index', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { shootLogText: { type: 'string' } },
    },
  })
  async updateStoryboardShotShootLog(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('index') index: string,
    @Body(new ZodValidationPipe(UpdateShootLogBodySchema))
    body: z.infer<typeof UpdateShootLogBodySchema>,
  ) {
    const parsedIndex = Number(index);
    if (!Number.isFinite(parsedIndex) || parsedIndex <= 0) {
      throw new BadRequestException('index 参数无效');
    }

    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      const result = await this.heroStoryboard.updateShotShootLog(
        taskId,
        parsedIndex,
        body.shootLogText,
      );
      return assertResponse(
        HeroStoryboardTaskResponseSchema,
        normalizeTaskResponse(result),
        'HeroStoryboardController.updateStoryboardShotShootLog',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '保存镜头手账失败'),
      );
    }
  }
}
