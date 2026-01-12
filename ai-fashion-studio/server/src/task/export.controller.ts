import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import archiver from 'archiver';
import * as fs from 'fs-extra';
import * as path from 'path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { TaskAccessService } from './task-access.service';

@Controller('tasks')
export class ExportController {
    constructor(private readonly taskAccess: TaskAccessService) { }

    @Get(':id/export')
    async exportTask(
        @CurrentUser() user: UserModel,
        @Param('id') id: string,
        @Res() res: Response
    ) {
        const task = await this.taskAccess.requireReadableTask(id, user);

        // Set response headers for ZIP download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=task-${id}.zip`);

        // Create archiver instance
        const archive = archiver('zip', { zlib: { level: 9 } });

        // Pipe archive to response
        archive.pipe(res);

        // Add task.json
        const taskJson = {
            id: task.id,
            createdAt: task.createdAt,
            requirements: task.requirements,
            shotCount: task.shotCount,
            resolution: task.resolution,
            status: task.status
        };
        archive.append(JSON.stringify(taskJson, null, 2), { name: 'task.json' });

        // Add plan.json (brain plan)
        if (task.brainPlan) {
            archive.append(JSON.stringify(task.brainPlan, null, 2), { name: 'plan.json' });
        }

        // Add reference images to refs/ folder
        if (task.faceRefPaths) {
            for (let i = 0; i < task.faceRefPaths.length; i++) {
                const refPath = task.faceRefPaths[i];
                if (await fs.pathExists(refPath)) {
                    const ext = path.extname(refPath);
                    archive.file(refPath, { name: `refs/face_ref_${i + 1}${ext}` });
                }
            }
        }

        // Add generated shots to shots/ folder
        if (task.shots) {
            for (const shot of task.shots) {
                if (shot.imagePath && await fs.pathExists(shot.imagePath)) {
                    const ext = path.extname(shot.imagePath);
                    archive.file(shot.imagePath, { name: `shots/${shot.shotCode || shot.id}${ext}` });
                }

                // Add version history if exists
                if (shot.versions && shot.versions.length > 1) {
                    for (const version of shot.versions) {
                        if (version.imagePath && await fs.pathExists(version.imagePath)) {
                            const ext = path.extname(version.imagePath);
                            archive.file(version.imagePath, {
                                name: `diffs/${shot.shotCode || shot.id}_v${version.versionId}${ext}`
                            });
                        }
                    }
                }
            }
        }

        // Fallback: add result images if shots array not available
        if (!task.shots && task.resultImages) {
            for (let i = 0; i < task.resultImages.length; i++) {
                const imgPath = task.resultImages[i];
                if (await fs.pathExists(imgPath)) {
                    const ext = path.extname(imgPath);
                    archive.file(imgPath, { name: `shots/shot_${i + 1}${ext}` });
                }
            }
        }

        // Finalize archive
        await archive.finalize();
    }
}
