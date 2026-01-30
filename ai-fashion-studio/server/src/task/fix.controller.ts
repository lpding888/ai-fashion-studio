import {
  Controller,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FixService } from './fix.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { TaskAccessService } from './task-access.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  FixShotBodySchema,
  UpdateQcStatusBodySchema,
  FixUpdateQcStatusResponseSchema,
  FixShotResponseSchema,
} from '../contracts/api.schemas';
import { z } from 'zod';
import { assertResponse } from '../common/response-contract';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class FixController {
  constructor(
    private readonly fixService: FixService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  @Post(':taskId/shots/:shotId/qc')
  @ApiOperation({ summary: '更新分镜质检状态' })
  @ApiParam({ name: 'taskId', type: String })
  @ApiParam({ name: 'shotId', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        qcStatus: { type: 'string', enum: ['APPROVED', 'NEEDS_FIX'] },
      },
      required: ['qcStatus'],
    },
  })
  async updateQcStatus(
    @CurrentUser() user: UserModel,
    @Param('taskId') taskId: string,
    @Param('shotId') shotId: string,
    @Body(new ZodValidationPipe(UpdateQcStatusBodySchema))
    dto: z.infer<typeof UpdateQcStatusBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    const result = await this.fixService.updateQcStatus(
      taskId,
      shotId,
      dto.qcStatus,
    );
    return assertResponse(
      FixUpdateQcStatusResponseSchema,
      result,
      'FixController.updateQcStatus',
    );
  }

  @Post(':taskId/shots/:shotId/fix')
  @ApiOperation({ summary: '提交分镜修复反馈' })
  @ApiParam({ name: 'taskId', type: String })
  @ApiParam({ name: 'shotId', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { feedback: { type: 'string' } },
      required: ['feedback'],
    },
  })
  async fixShot(
    @CurrentUser() user: UserModel,
    @Param('taskId') taskId: string,
    @Param('shotId') shotId: string,
    @Body(new ZodValidationPipe(FixShotBodySchema))
    dto: z.infer<typeof FixShotBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    const result = await this.fixService.fixShot(
      taskId,
      shotId,
      dto.feedback,
    );
    return assertResponse(
      FixShotResponseSchema,
      result,
      'FixController.fixShot',
    );
  }
}
