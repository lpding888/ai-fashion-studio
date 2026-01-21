import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { ModelConfig } from '../common/model-config';
import { DbService } from '../db/db.service';
import type { Shot, TaskModel } from '../db/models';
import { PainterService } from '../painter/painter.service';
import { CosService } from '../cos/cos.service';
import { TaskBillingService } from './task-billing.service';

type RenderingPlanShot = {
  shot_id?: string;
  id?: string;
  type?: string;
  prompt_en?: string;
  prompt?: string;
};

type RenderingPlanImageAnalysis = {
  index: number;
  view_type?: string;
  description?: string;
  focus_area?: string;
};

type RenderingPlan = {
  shots: RenderingPlanShot[];
  image_analysis?: RenderingPlanImageAnalysis[];
};

type TaskShot = Shot & {
  prompt?: string;
  prompt_en?: string;
  shot_id?: string;
};

type ScfShotRequest = {
  shotId: string;
  prompt: string;
  images: Array<{ url: string; label: string }>;
  painterParams: { aspectRatio?: TaskModel['aspectRatio']; imageSize: string };
};

type ScfShotResult = {
  shotId?: string;
  success?: boolean;
  imageUrl?: string;
  error?: string;
};

@Injectable()
export class TaskRenderingOrchestratorService {
  private logger = new Logger(TaskRenderingOrchestratorService.name);
  readonly maxPainterGarmentRefs = 5;
  readonly maxPainterFaceRefs = 2;

  constructor(
    private readonly db: DbService,
    private readonly painter: PainterService,
    private readonly billing: TaskBillingService,
    private readonly cos: CosService,
  ) {}

  private resolveErrorMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }

  limitPainterReferenceImages(garmentPaths: string[], facePaths: string[]) {
    const limitedGarments = garmentPaths.slice(0, this.maxPainterGarmentRefs);
    const limitedFaces = facePaths.slice(0, this.maxPainterFaceRefs);

    return {
      garment: limitedGarments,
      face: limitedFaces,
      all: [...limitedGarments, ...limitedFaces],
    };
  }

  /**
   * Convert resolution string to pixel dimensions
   */
  convertResolution(resolution: string): string {
    const resolutionMap: Record<string, string> = {
      '1K': '1024x1024',
      '2K': '2048x2048',
      '4K': '4096x4096',
    };
    return resolutionMap[resolution] || '2048x2048';
  }

  /**
   * Helper: Determine grid layout based on shot count
   */
  getGridLayout(count: number): string {
    if (count <= 1) return '1x1';
    if (count === 2) return '1x2';
    if (count === 3) return '1x3';
    if (count === 4) return '2x2';
    if (count <= 6) return '2x3';
    if (count <= 9) return '3x3';
    return '4x3';
  }

  /**
   * Build enhanced reference image instruction using Brain's image analysis
   */
  buildReferenceImageInstruction(
    plan: RenderingPlan,
    garmentImageCount: number,
    faceRefCount: number,
  ): string {
    let instruction = `⚠️ CRITICAL: EXACTLY MATCH THE UPLOADED GARMENT

`;

    // Add image analysis breakdown if available from Brain
    if (plan.image_analysis && plan.image_analysis.length > 0) {
      instruction += `📸 Reference Images Breakdown:\n`;

      for (const img of plan.image_analysis) {
        const viewTypeLabel =
          {
            front: '正面视图',
            back: '背面视图',
            side: '侧面视图',
            detail: '细节特写',
            full_outfit: '全身造型',
            angle: '斜角视图',
            texture: '材质纹理',
            other: '其他角度',
          }[img.view_type] || img.view_type;

        instruction += `  - Image ${img.index + 1} [${viewTypeLabel}]: ${img.description}`;
        if (img.focus_area) {
          instruction += ` (Focus: ${img.focus_area})`;
        }
        instruction += `\n`;
      }

      instruction += `\n⚠️ CRITICAL: All these images show THE SAME GARMENT from different angles.\n`;
      instruction += `You MUST study ALL views to understand the complete design.\n\n`;
    } else {
      // Fallback when Brain doesn't provide image_analysis
      instruction += `📸 Reference Images:\n`;
      instruction += `  - Images 1-${garmentImageCount}: Multiple views of THE SAME garment you MUST replicate\n`;
      instruction += `    * Study ALL angles to understand complete design, materials, and details\n`;
      instruction += `    * They show ONE garment from different perspectives (front, back, details)\n`;
      if (faceRefCount > 0) {
        instruction += `  - Image ${garmentImageCount + 1}: Face/model reference\n`;
      }
      instruction += `\n`;
    }

    // Keep original strong consistency instruction (upgraded, not replaced)
    instruction += `ABSOLUTE REQUIREMENTS:\n`;
    instruction += `1. Based on the uploaded reference images, silently analyze and maintain 100% consistency\n`;
    instruction += `2. Exact wardrobe: materials, colors, textures, stitching, accessories must be IDENTICAL\n`;
    instruction += `3. Model's facial features, hair, body proportions must remain IDENTICAL (if face ref provided)\n`;
    instruction += `4. Do NOT add or remove anything. Do NOT reinterpret materials or colors\n`;
    instruction += `5. Do NOT invent new design elements not shown in the reference images\n\n`;

    return instruction;
  }

  /**
   * Grid Mode: Generate one contact sheet with all shots
   */
  async renderGridMode(
    task: TaskModel,
    plan: RenderingPlan,
    allRefImages: string[],
    garmentRefCount: number,
    faceRefCount: number,
    config?: ModelConfig,
    billingKeys?: { reserveEventKey: string; settleEventKey: string },
  ) {
    const shotCount = plan.shots.length;
    const gridLayout = this.getGridLayout(shotCount);

    this.logger.log(
      `📐 Grid Mode: Generating ${gridLayout} contact sheet with ${shotCount} frames`,
    );

    // Build enhanced reference instruction (upgraded from static text)
    const referenceInstruction = this.buildReferenceImageInstruction(
      plan,
      garmentRefCount,
      faceRefCount,
    );

    const gridInstruction = `${referenceInstruction}Your visible output must be:
One ${gridLayout} contact sheet image (${shotCount} frames).

Each frame must represent a resting point after a dramatic camera move - only describe the final camera position and what the subject is doing, never the motion itself.

Required ${shotCount}-Frame Shot List:
`;

    let shotDescriptions = '';
    for (let i = 0; i < plan.shots.length; i++) {
      const shot = plan.shots[i];
      const shotNum = i + 1;
      shotDescriptions += `${shotNum}. ${shot.type || 'Shot ' + shotNum}\n`;
      shotDescriptions += `${shot.prompt_en || shot.prompt}\n\n`;
    }

    const continuityRequirements = `
Continuity & Technical Requirements:
- Maintain perfect wardrobe fidelity in every frame: exact garment type, silhouette, material, color, texture, stitching, accessories, closures, jewelry, shoes, hair, and makeup
- Environment, textures, and lighting must remain consistent
- Depth of field shifts naturally with focal length (deep for distant shots, shallow for close/detail shots)
- Photoreal textures and physically plausible light behavior required
- Frames must feel like different camera placements within the same scene, not different scenes`;

    const fullPrompt =
      gridInstruction + shotDescriptions + continuityRequirements;

    const useScf = this.painter.isScfEnabled();
    if (useScf) {
      try {
        const scfShots: ScfShotRequest[] = [
          {
            shotId: `grid_${task.id}`,
            prompt: fullPrompt,
            images: allRefImages.map((url, idx) => ({
              url,
              label: `REF_${idx + 1}`,
            })),
            painterParams: {
              aspectRatio: task.aspectRatio,
              imageSize: this.convertResolution(task.resolution),
            },
          },
        ];

        const results = (await this.painter.generateImagesViaScf({
          taskId: task.id,
          shots: scfShots,
          config,
        })) as ScfShotResult[];
        const r = results[0];
        const imageUrl =
          r?.success && r?.imageUrl ? String(r.imageUrl).trim() : '';
        if (!imageUrl) {
          throw new Error(r?.error || 'SCF grid rendering failed');
        }

        await this.db.updateTask(task.id, {
          status: 'COMPLETED',
          resultImages: [imageUrl],
          shots: plan.shots.map((shot, idx) => ({
            id: crypto.randomUUID(),
            shotCode: shot.shot_id || shot.id || `${idx + 1}`,
            type: shot.type,
            promptEn: shot.prompt_en || shot.prompt,
            status: 'RENDERED',
            imagePath: imageUrl,
            imageUrl,
          })),
        });

        this.logger.log(
          `✅ Grid contact sheet generated via SCF for task ${task.id}`,
        );

        try {
          if (task.userId) {
            const actual = this.billing.creditsForSuccessfulLegacyGridRender({
              resolution: task.resolution,
            });
            await this.billing.settleOnce({
              taskId: task.id,
              userId: task.userId,
              reserveEventKey:
                billingKeys?.reserveEventKey ||
                `reserve:legacy:initial:${task.id}`,
              settleEventKey:
                billingKeys?.settleEventKey ||
                `settle:legacy:initial:${task.id}`,
              actualAmount: actual,
              reason: '任务结算：拼图（SCF）',
            });
          }
        } catch (err) {
          const errorMessage = this.resolveErrorMessage(err, '结算失败');
          await this.billing.markBillingError(task.id, errorMessage);
        }

        return;
      } catch (err) {
        const errorMessage = this.resolveErrorMessage(
          err,
          'SCF grid rendering failed',
        );
        this.logger.warn(
          `SCF grid rendering failed for task ${task.id}, fallback to direct painter: ${errorMessage}`,
        );
      }
    }

    try {
      const imagePath = await this.painter.generateImage(
        fullPrompt,
        allRefImages,
        {
          aspectRatio: task.aspectRatio,
          imageSize: this.convertResolution(task.resolution),
        },
        config,
      );

      let imageUrl: string | undefined;
      const isHttpUrl = (value: string) =>
        value.startsWith('http://') || value.startsWith('https://');
      if (isHttpUrl(imagePath)) {
        imageUrl = imagePath;
      } else if (this.cos.isEnabled()) {
        const ext = path.extname(imagePath) || '.jpg';
        const filename = path.basename(imagePath);
        const key = `uploads/tasks/${task.id}/legacy/grid/${filename || `${Date.now()}${ext}`}`;
        try {
          await this.cos.uploadFile(key, imagePath);
          imageUrl = this.cos.getImageUrl(key);
        } catch (err) {
          const errorMessage = this.resolveErrorMessage(
            err,
            'COS upload failed',
          );
          this.logger.warn(
            `COS upload failed for legacy grid (task ${task.id}): ${errorMessage}`,
          );
        }
      }

      await this.db.updateTask(task.id, {
        status: 'COMPLETED',
        resultImages: [imageUrl || imagePath],
        shots: plan.shots.map((shot, idx) => ({
          id: crypto.randomUUID(),
          shotCode: shot.shot_id || shot.id || `${idx + 1}`,
          type: shot.type,
          promptEn: shot.prompt_en || shot.prompt,
          status: 'RENDERED',
          imagePath: imagePath,
          imageUrl: imageUrl,
        })),
      });

      this.logger.log(`✅ Grid contact sheet generated for task ${task.id}`);

      // 结算（Grid 固定扣2）
      try {
        if (task.userId) {
          const actual = this.billing.creditsForSuccessfulLegacyGridRender({
            resolution: task.resolution,
          });
          await this.billing.settleOnce({
            taskId: task.id,
            userId: task.userId,
            reserveEventKey:
              billingKeys?.reserveEventKey ||
              `reserve:legacy:initial:${task.id}`,
            settleEventKey:
              billingKeys?.settleEventKey || `settle:legacy:initial:${task.id}`,
            actualAmount: actual,
            reason: '任务结算：拼图',
          });
        }
      } catch (err) {
        const errorMessage = this.resolveErrorMessage(err, '结算失败');
        await this.billing.markBillingError(task.id, errorMessage);
      }
    } catch (err) {
      const errorMessage = this.resolveErrorMessage(
        err,
        'Grid mode rendering failed',
      );
      this.logger.error(`Grid mode rendering failed for task ${task.id}`, err);
      await this.db.updateTask(task.id, {
        status: 'FAILED',
        error: errorMessage,
      });
      throw err;
    }
  }

  /**
   * Individual Mode: Generate separate image for each shot
   */
  async renderIndividualMode(
    task: TaskModel,
    plan: RenderingPlan,
    allRefImages: string[],
    garmentRefCount: number,
    faceRefCount: number,
    config?: ModelConfig,
    billingKeys?: { reserveEventKey: string; settleEventKey: string },
  ) {
    this.logger.log(
      `🎬 Individual Mode: Generating ${plan.shots.length} separate images`,
    );

    const generatedShots: TaskShot[] = (plan.shots || []).map((shot, idx) => {
      const shotId = shot.shot_id || shot.id || `${idx + 1}`;
      return {
        id: crypto.randomUUID(),
        shotCode: shotId,
        type: shot.type,
        promptEn: shot.prompt_en || shot.prompt,
        status: 'PENDING',
        imagePath: undefined,
        error: undefined,
      };
    });

    const referenceInstruction = this.buildReferenceImageInstruction(
      plan,
      garmentRefCount,
      faceRefCount,
    );

    // Progressive rendering UX: persist placeholders first, then update per-shot as soon as it finishes.
    // This allows the client to "show one image as soon as one succeeds" while the task is still rendering.
    await this.db.updateTask(task.id, {
      shots: generatedShots,
      resultImages: [],
    });

    const useScf = this.painter.isScfEnabled();
    if (useScf) {
      let scfCommitted = false;
      try {
        const scfShots: ScfShotRequest[] = [];
        const preFailed = new Map<string, string>();
        const scfGeneratedShots = generatedShots.map((shot) => ({ ...shot }));

        for (let i = 0; i < plan.shots.length; i += 1) {
          const shot = plan.shots[i];
          const shotId = shot.shot_id || shot.id || `${i + 1}`;
          let prompt =
            task.editedPrompts?.[shotId] || shot.prompt_en || shot.prompt;

          if (!prompt) {
            preFailed.set(String(shotId), `No prompt found for shot ${shotId}`);
            continue;
          }

          prompt = referenceInstruction + prompt;

          scfShots.push({
            shotId,
            prompt,
            images: allRefImages.map((url, idx) => ({
              url,
              label: `REF_${idx + 1}`,
            })),
            painterParams: {
              aspectRatio: task.aspectRatio,
              imageSize: this.convertResolution(task.resolution),
            },
          });
        }

        let results: ScfShotResult[] = [];
        if (scfShots.length > 0) {
          results = (await this.painter.generateImagesViaScf({
            taskId: task.id,
            shots: scfShots,
            config,
          })) as ScfShotResult[];
        }

        const resultMap = new Map<string, ScfShotResult>();
        for (const r of results) {
          if (r?.shotId) resultMap.set(String(r.shotId), r);
        }

        for (let i = 0; i < scfGeneratedShots.length; i += 1) {
          const target = scfGeneratedShots[i];
          const shotId = target.shotCode || `${i + 1}`;
          const preError = preFailed.get(String(shotId));
          if (preError) {
            scfGeneratedShots[i] = {
              ...target,
              status: 'FAILED',
              error: preError,
            };
            continue;
          }

          const r = resultMap.get(String(shotId)) || results[i];
          const imageUrl =
            r?.success && r?.imageUrl ? String(r.imageUrl).trim() : '';
          if (imageUrl) {
            scfGeneratedShots[i] = {
              ...target,
              status: 'RENDERED',
              imagePath: imageUrl,
              imageUrl,
              error: undefined,
            };
          } else {
            scfGeneratedShots[i] = {
              ...target,
              status: 'FAILED',
              error: r?.error || 'Shot rendering failed',
            };
          }
        }

        const successfulImages = scfGeneratedShots
          .filter((s) => s.status === 'RENDERED')
          .map((s) => s.imageUrl || s.imagePath)
          .filter((value): value is string => Boolean(value));

        await this.db.updateTask(task.id, {
          status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED',
          resultImages: successfulImages,
          shots: scfGeneratedShots,
        });
        scfCommitted = true;

        this.logger.log(
          `Task ${task.id} Completed with ${successfulImages.length} images.`,
        );

        try {
          if (task.userId) {
            const actual =
              this.billing.creditsForSuccessfulLegacyIndividualRender({
                successfulImages: successfulImages.length,
                resolution: task.resolution,
              });
            await this.billing.settleOnce({
              taskId: task.id,
              userId: task.userId,
              reserveEventKey:
                billingKeys?.reserveEventKey ||
                `reserve:legacy:initial:${task.id}`,
              settleEventKey:
                billingKeys?.settleEventKey ||
                `settle:legacy:initial:${task.id}`,
              actualAmount: actual,
              reason: '任务结算：单图（SCF）',
            });
          }
        } catch (err) {
          const errorMessage = this.resolveErrorMessage(err, '结算失败');
          await this.billing.markBillingError(task.id, errorMessage);
        }

        return;
      } catch (err) {
        const errorMessage = this.resolveErrorMessage(
          err,
          'SCF individual rendering failed',
        );
        this.logger.warn(
          `SCF individual rendering failed for task ${task.id}, fallback to direct painter: ${errorMessage}`,
        );
        if (scfCommitted) throw err;
      }
    }

    const persistProgress = async () => {
      const successfulImages = generatedShots
        .filter((s) => s.status === 'RENDERED')
        .map((s) => s.imageUrl || s.imagePath)
        .filter((value): value is string => Boolean(value));

      await this.db.updateTask(task.id, {
        shots: generatedShots,
        resultImages: successfulImages,
      });
    };

    for (let i = 0; i < plan.shots.length; i++) {
      const shot = plan.shots[i];
      const shotId = shot.shot_id || shot.id || `${i + 1}`;

      this.logger.log(`Painting Shot ${shotId}...`);

      try {
        // Check for user-edited prompt first
        let prompt =
          task.editedPrompts?.[shotId] || shot.prompt_en || shot.prompt;

        if (!prompt) {
          throw new Error(`No prompt found for shot ${shotId}`);
        }

        // Add enhanced consistency instruction to each individual shot (upgraded from static text)
        prompt = referenceInstruction + prompt;

        const imagePath = await this.painter.generateImage(
          prompt,
          allRefImages,
          {
            aspectRatio: task.aspectRatio,
            imageSize: this.convertResolution(task.resolution),
          },
          config,
        );

        let imageUrl: string | undefined;
        const isHttpUrl = (value: string) =>
          value.startsWith('http://') || value.startsWith('https://');
        if (isHttpUrl(imagePath)) {
          imageUrl = imagePath;
        } else if (this.cos.isEnabled()) {
          const ext = path.extname(imagePath) || '.jpg';
          const filename = path.basename(imagePath);
          const key = `uploads/tasks/${task.id}/legacy/${shotId}/${filename || `${Date.now()}${ext}`}`;
          try {
            await this.cos.uploadFile(key, imagePath);
            imageUrl = this.cos.getImageUrl(key);
          } catch (err) {
            const errorMessage = this.resolveErrorMessage(
              err,
              'COS upload failed',
            );
            this.logger.warn(
              `COS upload failed for legacy shot ${shotId} (task ${task.id}): ${errorMessage}`,
            );
          }
        }

        const targetIndex = generatedShots.findIndex(
          (s) => s.shotCode === shotId,
        );
        if (targetIndex >= 0) {
          generatedShots[targetIndex] = {
            ...generatedShots[targetIndex],
            status: 'RENDERED',
            imagePath: imagePath,
            imageUrl,
            error: undefined,
          };
        } else {
          generatedShots.push({
            id: crypto.randomUUID(),
            shotCode: shotId,
            type: shot.type,
            promptEn: shot.prompt_en || shot.prompt,
            status: 'RENDERED',
            imagePath: imagePath,
            imageUrl,
          });
        }

        await persistProgress();

        this.logger.log(`✅ Shot ${shotId} rendered successfully`);
      } catch (err) {
        const errorMessage = this.resolveErrorMessage(
          err,
          `Shot ${shotId} rendering failed`,
        );
        this.logger.error(`Failed to paint shot ${shotId}`, err);
        const targetIndex = generatedShots.findIndex(
          (s) => s.shotCode === shotId,
        );
        if (targetIndex >= 0) {
          generatedShots[targetIndex] = {
            ...generatedShots[targetIndex],
            status: 'FAILED',
            imagePath: undefined,
            error: errorMessage,
          };
        } else {
          generatedShots.push({
            id: crypto.randomUUID(),
            shotCode: shotId,
            type: shot.type,
            promptEn: shot.prompt_en || shot.prompt,
            status: 'FAILED',
            error: errorMessage,
          });
        }

        await persistProgress();
      }
    }

    // Collect successful images
    const successfulImages = generatedShots
      .filter((s) => s.status === 'RENDERED')
      .map((s) => s.imageUrl || s.imagePath)
      .filter((value): value is string => Boolean(value));

    await this.db.updateTask(task.id, {
      status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED',
      resultImages: successfulImages,
      shots: generatedShots,
    });

    this.logger.log(
      `Task ${task.id} Completed with ${successfulImages.length} images.`,
    );

    // 结算（Individual 按成功张数扣费）
    try {
      if (task.userId) {
        const actual = this.billing.creditsForSuccessfulLegacyIndividualRender({
          successfulImages: successfulImages.length,
          resolution: task.resolution,
        });
        await this.billing.settleOnce({
          taskId: task.id,
          userId: task.userId,
          reserveEventKey:
            billingKeys?.reserveEventKey || `reserve:legacy:initial:${task.id}`,
          settleEventKey:
            billingKeys?.settleEventKey || `settle:legacy:initial:${task.id}`,
          actualAmount: actual,
          reason: '任务结算：单图',
        });
      }
    } catch (err) {
      const errorMessage = this.resolveErrorMessage(err, '结算失败');
      await this.billing.markBillingError(task.id, errorMessage);
    }
  }
}
