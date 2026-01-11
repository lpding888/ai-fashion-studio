import { Controller, Post, Param, Body, BadRequestException } from '@nestjs/common';
import { FixService } from './fix.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { TaskAccessService } from './task-access.service';

export class FixShotDto {
    feedback: string;
}

export class UpdateQcStatusDto {
    qcStatus: 'APPROVED' | 'NEEDS_FIX';
}

@Controller('tasks')
export class FixController {
    constructor(
        private readonly fixService: FixService,
        private readonly taskAccess: TaskAccessService,
    ) { }

    @Post(':taskId/shots/:shotId/qc')
    async updateQcStatus(
        @CurrentUser() user: UserModel,
        @Param('taskId') taskId: string,
        @Param('shotId') shotId: string,
        @Body() dto: UpdateQcStatusDto
    ) {
        if (!['APPROVED', 'NEEDS_FIX'].includes(dto.qcStatus)) {
            throw new BadRequestException('Invalid qcStatus, must be APPROVED or NEEDS_FIX');
        }
        await this.taskAccess.requireWritableTask(taskId, user);
        return this.fixService.updateQcStatus(taskId, shotId, dto.qcStatus);
    }

    @Post(':taskId/shots/:shotId/fix')
    async fixShot(
        @CurrentUser() user: UserModel,
        @Param('taskId') taskId: string,
        @Param('shotId') shotId: string,
        @Body() dto: FixShotDto
    ) {
        if (!dto.feedback || dto.feedback.trim().length === 0) {
            throw new BadRequestException('Feedback is required for fix');
        }
        await this.taskAccess.requireWritableTask(taskId, user);
        return this.fixService.fixShot(taskId, shotId, dto.feedback);
    }
}
