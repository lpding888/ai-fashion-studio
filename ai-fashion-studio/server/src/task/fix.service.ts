import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { BrainService } from '../brain/brain.service';
import { PainterService } from '../painter/painter.service';
import { ShotVersion } from '../db/models';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';

@Injectable()
export class FixService {
  private logger = new Logger(FixService.name);

  constructor(
    private db: DbService,
    private brain: BrainService,
    private painter: PainterService,
    private readonly modelConfigResolver: ModelConfigResolverService,
  ) {}

  async updateQcStatus(
    taskId: string,
    shotId: string,
    qcStatus: 'APPROVED' | 'NEEDS_FIX',
  ) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new BadRequestException('Task not found');
    if (!task.shots) throw new BadRequestException('No shots found in task');

    const shotIndex = task.shots.findIndex((s) => s.id === shotId);
    if (shotIndex === -1) throw new BadRequestException('Shot not found');

    task.shots[shotIndex].qcStatus = qcStatus;
    await this.db.updateTask(taskId, { shots: task.shots });

    this.logger.log(`Shot ${shotId} QC status updated to ${qcStatus}`);
    return { success: true, qcStatus };
  }

  async fixShot(taskId: string, shotId: string, feedback: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new BadRequestException('Task not found');
    if (!task.shots) throw new BadRequestException('No shots found in task');

    const shotIndex = task.shots.findIndex((s) => s.id === shotId);
    if (shotIndex === -1) throw new BadRequestException('Shot not found');

    const shot = task.shots[shotIndex];

    this.logger.log(`Fixing shot ${shotId} with feedback: ${feedback}`);

    const runtimeConfig =
      await this.modelConfigResolver.resolveRuntimeFromSnapshot(task.config);

    // Generate fix prompt using Brain (translate Chinese feedback to English instruction)
    const fixPromptResult = await this.brain.translateFixFeedback(
      shot.promptEn,
      feedback,
      runtimeConfig,
    );

    const fixPromptEn = fixPromptResult.fixPromptEn;
    this.logger.log(`Generated fix prompt: ${fixPromptEn}`);

    // Gather reference images
    const allRefImages: string[] = [];
    if (task.resultImages) {
      // Use original garment images from uploads folder if available
      // For now, we'll use existing ref paths from task
    }
    if (task.faceRefPaths) {
      allRefImages.push(...task.faceRefPaths);
    }

    // Include the current shot image as reference
    if (shot.imagePath) {
      allRefImages.push(shot.imagePath);
    }

    // Generate new image with fix prompt
    const newImagePath = await this.painter.generateImage(
      fixPromptEn,
      allRefImages,
      {},
      runtimeConfig,
    );

    // Create new version
    const versions = shot.versions || [];
    if (versions.length === 0 && shot.imagePath) {
      // Add original as version 1
      versions.push({
        versionId: 1,
        imagePath: shot.imagePath,
        prompt: shot.promptEn,
        createdAt: Date.now() - 1000, // Slightly earlier
      });
    }

    const newVersion: ShotVersion = {
      versionId: versions.length + 1,
      imagePath: newImagePath,
      prompt: fixPromptEn,
      fixFeedback: feedback,
      createdAt: Date.now(),
    };
    versions.push(newVersion);

    // Update shot
    task.shots[shotIndex] = {
      ...shot,
      imagePath: newImagePath,
      promptEn: fixPromptEn,
      versions: versions,
      currentVersion: newVersion.versionId,
      qcStatus: 'PENDING',
    };

    // Update result images
    const resultImages = task.shots
      .filter((s) => s.status === 'RENDERED' && s.imagePath)
      .map((s) => s.imagePath);

    await this.db.updateTask(taskId, {
      shots: task.shots,
      resultImages: resultImages,
    });

    this.logger.log(
      `Shot ${shotId} fixed successfully, new version: ${newVersion.versionId}`,
    );

    return {
      success: true,
      shotId,
      newVersion: newVersion,
      imagePath: newImagePath,
    };
  }
}
