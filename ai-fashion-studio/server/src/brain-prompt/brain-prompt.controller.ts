import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { UserDbService } from '../db/user-db.service';
import { DbService } from '../db/db.service';
import { BrainService } from '../brain/brain.service';
import { BrainPromptService } from './brain-prompt.service';

@Controller('admin/brain-prompts')
export class BrainPromptController {
    constructor(
        private readonly promptStore: BrainPromptService,
        private readonly authService: AuthService,
        private readonly userDb: UserDbService,
        private readonly db: DbService,
        private readonly brain: BrainService,
    ) { }

    private async requireAdmin(authorization?: string) {
        const token = this.authService.extractTokenFromHeader(authorization);
        if (!token) throw new BadRequestException('未提供认证令牌');

        const payload = this.authService.verifyToken(token);
        if (!payload) throw new BadRequestException('令牌无效或已过期');

        const user = await this.userDb.getUserById(payload.userId);
        if (!user || user.role !== 'ADMIN') throw new BadRequestException('需要管理员权限');
        if (user.status !== 'ACTIVE')
            throw new BadRequestException(user.status === 'PENDING' ? '账户待管理员审核' : '账户已被禁用');

        return { id: user.id, username: user.username };
    }

    @Get('active')
    async getActive(@Headers('authorization') authorization: string) {
        await this.requireAdmin(authorization);
        const active = await this.promptStore.getActive();
        return { success: true, ...active };
    }

    @Get('versions')
    async listVersions(@Headers('authorization') authorization: string) {
        await this.requireAdmin(authorization);
        const versions = await this.promptStore.listVersions();
        return { success: true, versions };
    }

    @Get('versions/:versionId')
    async getVersion(
        @Headers('authorization') authorization: string,
        @Param('versionId') versionId: string
    ) {
        await this.requireAdmin(authorization);
        const version = await this.promptStore.getVersion(versionId);
        if (!version) throw new BadRequestException('版本不存在');
        return { success: true, version };
    }

    @Post('versions')
    async createVersion(
        @Headers('authorization') authorization: string,
        @Body() body: { content: string; note?: string; publish?: boolean }
    ) {
        const admin = await this.requireAdmin(authorization);
        try {
            const meta = await this.promptStore.createVersion(body.content, admin, body.note, body.publish);
            if (body.publish) {
                const created = await this.promptStore.getVersion(meta.versionId);
                if (created) this.brain.setSystemPrompt(created.content);
            }
            return { success: true, version: meta };
        } catch (e: any) {
            throw new BadRequestException(e.message || '创建版本失败');
        }
    }

    @Post('publish')
    async publish(
        @Headers('authorization') authorization: string,
        @Body() body: { versionId: string }
    ) {
        const admin = await this.requireAdmin(authorization);
        try {
            const { version, ref } = await this.promptStore.publishVersion(body.versionId, admin);
            this.brain.setSystemPrompt(version.content);
            const { content: _content, ...safeVersion } = version;
            return { success: true, ref, version: safeVersion };
        } catch (e: any) {
            throw new BadRequestException(e.message || '发布失败');
        }
    }

    @Post('ab-compare')
    async abCompare(
        @Headers('authorization') authorization: string,
        @Body() body: { taskId: string; versionA: string; versionB: string }
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
                this.brain.planTask(imagePaths, task.requirements, options as any, task.config, vA.content),
                this.brain.planTask(imagePaths, task.requirements, options as any, task.config, vB.content),
            ]);

            return {
                success: true,
                metaA: { versionId: vA.versionId, sha256: vA.sha256, createdAt: vA.createdAt, note: vA.note, createdBy: vA.createdBy },
                metaB: { versionId: vB.versionId, sha256: vB.sha256, createdAt: vB.createdAt, note: vB.note, createdBy: vB.createdBy },
                planA: a.plan,
                thinkingA: a.thinkingProcess,
                planB: b.plan,
                thinkingB: b.thinkingProcess,
            };
        } catch (e: any) {
            throw new BadRequestException(e.message || 'A/B 对照失败');
        }
    }
}
