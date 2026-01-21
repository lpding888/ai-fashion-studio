import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { HeroStoryboardService } from './hero-storyboard.service';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { TaskAccessService } from './task-access.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const UpdateStoryboardShotBodySchema = z
  .object({
    patch: z
      .object({
        scene_subarea: z.string().optional(),
        action_pose: z.string().optional(),
        shot_type: z.string().optional(),
        goal: z.string().optional(),
        physical_logic: z.string().optional(),
        composition_notes: z.string().optional(),
        exec_instruction_text: z.string().optional(),
        occlusion_guard: z.array(z.string()).optional(),
        ref_requirements: z.array(z.string()).optional(),
        universal_requirements: z.array(z.string()).optional(),
        lighting_plan: z
          .object({
            scene_light: z.string().optional(),
            product_light: z
              .object({
                key: z.string().optional(),
                rim: z.string().optional(),
                fill: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        camera_choice: z
          .object({
            system: z.string().optional(),
            model: z.string().optional(),
            f_stop: z.string().optional(),
          })
          .optional(),
      })
      .strict(),
  })
  .strict()
  .refine((v) => Object.keys(v.patch || {}).length > 0, {
    message: 'patch 不能为空',
  });

const UpdateShootLogBodySchema = z
  .object({
    shootLogText: z.string().max(20000).default(''),
  })
  .strict();

const EditHeroBodySchema = z
  .object({
    maskImage: z
      .string()
      .url('maskImage 必须是可访问的 URL')
      .min(1, 'maskImage 不能为空'),
    referenceImages: z.array(z.string().url()).max(12).optional(),
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    editMode: z.string().trim().min(1).optional(),
  })
  .strict();

const SelectHeroVariantBodySchema = z
  .object({
    attemptCreatedAt: z.coerce
      .number()
      .int()
      .positive('attemptCreatedAt 参数无效'),
  })
  .strict();

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
  async confirmHero(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.confirmHero(taskId);
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
  async regenerateHero(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.regenerateHero(taskId);
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
  async updateHeroShootLog(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(UpdateShootLogBodySchema))
    body: z.infer<typeof UpdateShootLogBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.updateHeroShootLog(
        taskId,
        body.shootLogText,
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
  async editHero(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(EditHeroBodySchema))
    body: z.infer<typeof EditHeroBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.editHero(taskId, body);
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
  async selectHeroVariant(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(SelectHeroVariantBodySchema))
    body: z.infer<typeof SelectHeroVariantBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.selectHeroVariant(
        taskId,
        body.attemptCreatedAt,
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
      return await this.heroStoryboard.renderShot(taskId, parsed);
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
      return await this.heroStoryboard.selectShotVariant(
        taskId,
        parsedIndex,
        attemptCreatedAt,
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
  async renderGrid(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.renderGrid(taskId);
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
  async updateGridShootLog(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(UpdateShootLogBodySchema))
    body: z.infer<typeof UpdateShootLogBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.updateGridShootLog(
        taskId,
        body.shootLogText,
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
  async replanStoryboard(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.replanStoryboard(taskId);
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
      return await this.heroStoryboard.updateStoryboardShot(
        taskId,
        parsedIndex,
        parsedBody.patch,
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
      return await this.heroStoryboard.updateShotShootLog(
        taskId,
        parsedIndex,
        body.shootLogText,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(
        this.resolveErrorMessage(err, '保存镜头手账失败'),
      );
    }
  }
}
