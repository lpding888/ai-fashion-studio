import { BadRequestException, Body, Controller, HttpException, Param, Patch, Post } from '@nestjs/common';
import { HeroStoryboardService } from './hero-storyboard.service';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { TaskAccessService } from './task-access.service';

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
  .refine((v) => Object.keys(v.patch || {}).length > 0, { message: 'patch 不能为空' });

@Controller('tasks')
export class HeroStoryboardController {
  constructor(
    private readonly heroStoryboard: HeroStoryboardService,
    private readonly taskAccess: TaskAccessService,
  ) { }

  /**
   * 人工确认 Hero，并生成分镜动作卡（Phase 2）
   */
  @Post(':id/hero/confirm')
  async confirmHero(@CurrentUser() user: UserModel, @Param('id') taskId: string) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.confirmHero(taskId);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(e.message || '确认Hero失败');
    }
  }

  /**
   * 重新生成 Hero 母版（不需要重建任务）
   */
  @Post(':id/hero/regenerate')
  async regenerateHero(@CurrentUser() user: UserModel, @Param('id') taskId: string) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.regenerateHero(taskId);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(e.message || '重新生成Hero失败');
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
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(e.message || '生成镜头失败');
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
      return await this.heroStoryboard.selectShotVariant(taskId, parsedIndex, attemptCreatedAt);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(e.message || '选择镜头版本失败');
    }
  }

  /**
   * 四镜头拼图生成（Phase 3）
   */
  @Post(':id/storyboard/render-grid')
  async renderGrid(@CurrentUser() user: UserModel, @Param('id') taskId: string) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.renderGrid(taskId);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(e.message || '生成拼图失败');
    }
  }

  /**
   * 重新生成分镜规划（重新抽卡），不需要重做 Hero
   */
  @Post(':id/storyboard/replan')
  async replanStoryboard(@CurrentUser() user: UserModel, @Param('id') taskId: string) {
    await this.taskAccess.requireWritableTask(taskId, user);
    try {
      return await this.heroStoryboard.replanStoryboard(taskId);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(e.message || '重新生成分镜失败');
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
    let parsedBody: z.infer<typeof UpdateStoryboardShotBodySchema>;
    try {
      parsedBody = UpdateStoryboardShotBodySchema.parse(body);
    } catch (e: any) {
      const msg = e?.errors?.[0]?.message || '请求体格式错误';
      throw new BadRequestException(msg);
    }

    try {
      return await this.heroStoryboard.updateStoryboardShot(taskId, parsedIndex, parsedBody.patch);
    } catch (e: any) {
      if (e instanceof HttpException) throw e;
      throw new BadRequestException(e.message || '保存镜头文字失败');
    }
  }
}
