import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InviteCodeModel, UserModel } from './models';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const USERS_DB_PATH = path.join(process.cwd(), 'data', 'users.json');

interface UsersDatabase {
    users: UserModel[];
    inviteCodes: InviteCodeModel[];
}

@Injectable()
export class UserDbService implements OnModuleInit {
    private logger = new Logger(UserDbService.name);
    private db: UsersDatabase;

    async onModuleInit() {
        await this.initDb();
    }

    private async initDb() {
        await fs.ensureDir(path.dirname(USERS_DB_PATH));

        if (await fs.pathExists(USERS_DB_PATH)) {
            this.db = await fs.readJSON(USERS_DB_PATH);
            // 兼容旧数据：补齐缺失字段
            if (!this.db.inviteCodes) this.db.inviteCodes = [];
            this.logger.log(`Loaded ${this.db.users.length} users from database`);

            // 即使文件存在，也检查是否需要创建默认管理员
            await this.createDefaultAdmin();
        } else {
            this.db = { users: [], inviteCodes: [] };
            await this.saveDb();
            this.logger.log('Initialized new users database');

            // 创建默认管理员账户
            await this.createDefaultAdmin();
        }
    }

    private async saveDb() {
        await fs.writeJSON(USERS_DB_PATH, this.db, { spaces: 2 });
    }

    // 创建默认管理员
    private async createDefaultAdmin() {
        const adminExists = this.db.users.some(u => u.role === 'ADMIN');
        if (adminExists) return;

        const isProd = process.env.NODE_ENV === 'production';
        const bootstrapUsername = (process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
        const bootstrapPassword = (process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();

        if (isProd) {
            if (!bootstrapUsername || !bootstrapPassword) {
                throw new Error(
                    '生产环境未检测到管理员账户，且未配置 BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD'
                );
            }

            if (bootstrapPassword.length < 12) {
                throw new Error('BOOTSTRAP_ADMIN_PASSWORD 长度不足（至少 12 位）');
            }

            const admin: UserModel = {
                id: crypto.randomUUID(),
                username: bootstrapUsername,
                password: await bcrypt.hash(bootstrapPassword, 10),
                nickname: '管理员',
                status: 'ACTIVE',
                role: 'ADMIN',
                credits: 999999,
                totalTasks: 0,
                createdAt: Date.now()
            };

            this.db.users.push(admin);
            await this.saveDb();
            this.logger.log(`Created bootstrap admin account (username: ${admin.username})`);
            return;
        }

        const admin: UserModel = {
            id: crypto.randomUUID(),
            username: 'admin',
            password: await bcrypt.hash('admin123', 10),
            nickname: '管理员',
            status: 'ACTIVE',
            role: 'ADMIN',
            credits: 999999,
            totalTasks: 0,
            createdAt: Date.now()
        };

        this.db.users.push(admin);
        await this.saveDb();

        this.logger.log('Created default admin account (username: admin, password: admin123)');
        this.logger.warn('Please change the default admin password!');
    }

    // 创建用户（管理员用）
    async createUser(data: {
        id?: string;
        username: string;
        password: string;
        nickname?: string;
        email?: string;
        role?: 'USER' | 'ADMIN';
        status?: 'ACTIVE' | 'DISABLED' | 'PENDING';
        credits?: number;
        createdBy?: string;
        notes?: string;
    }): Promise<UserModel> {
        // 检查用户名是否已存在
        if (this.db.users.some(u => u.username === data.username)) {
            throw new Error('用户名已存在');
        }

        const user: UserModel = {
            id: data.id || crypto.randomUUID(),
            username: data.username,
            password: await bcrypt.hash(data.password, 10),
            nickname: data.nickname || data.username,
            email: data.email,
            status: data.status || 'ACTIVE',
            role: data.role || 'USER',
            credits: data.credits || 100,
            totalTasks: 0,
            createdAt: Date.now(),
            createdBy: data.createdBy,
            notes: data.notes
        };

        this.db.users.push(user);
        await this.saveDb();

        this.logger.log(`Created user: ${user.username} (${user.role})`);

        return user;
    }

    async registerWithInvite(params: {
        username: string;
        password: string;
        nickname?: string;
        email?: string;
        inviteCode?: string;
        inviteRequired: boolean;
        initialCredits?: number;
    }): Promise<UserModel> {
        const username = params.username.trim();
        const inviteCode = (params.inviteCode || '').trim();
        const userId = crypto.randomUUID();

        if (this.db.users.some(u => u.username === username)) {
            throw new Error('用户名已存在');
        }

        let lockedInvite: InviteCodeModel | undefined;
        if (params.inviteRequired) {
            if (!inviteCode) {
                throw new Error('邀请码不能为空');
            }

            const codeHash = crypto.createHash('sha256').update(inviteCode).digest('hex');
            const invite = this.db.inviteCodes.find(i => i.codeHash === codeHash);
            if (!invite || invite.revokedAt) {
                throw new Error('邀请码无效');
            }
            if (invite.usedAt || invite.usedByUserId) {
                throw new Error('邀请码已被使用');
            }

            // 先在内存里锁定（避免并发重复使用），后续失败会回滚
            invite.usedAt = Date.now();
            invite.usedByUserId = userId;
            lockedInvite = invite;
        }

        try {
            const user: UserModel = {
                id: userId,
                username,
                password: await bcrypt.hash(params.password, 10),
                nickname: params.nickname || username,
                email: params.email,
                status: 'ACTIVE',
                role: 'USER',
                credits: params.initialCredits ?? 100,
                totalTasks: 0,
                createdAt: Date.now(),
            };

            this.db.users.push(user);
            await this.saveDb();
            return user;
        } catch (err) {
            // 回滚锁定的邀请码
            if (lockedInvite) {
                lockedInvite.usedAt = undefined;
                lockedInvite.usedByUserId = undefined;
            }
            throw err;
        }
    }

    // 根据用户名查找
    async getUserByUsername(username: string): Promise<UserModel | null> {
        return this.db.users.find(u => u.username === username) || null;
    }

    // 根据ID查找
    async getUserById(id: string): Promise<UserModel | null> {
        return this.db.users.find(u => u.id === id) || null;
    }

    // 验证密码
    async verifyPassword(username: string, password: string): Promise<UserModel | null> {
        const user = await this.getUserByUsername(username);
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return user;
    }

    // 更新用户
    async updateUser(id: string, updates: Partial<UserModel>): Promise<UserModel> {
        const user = this.db.users.find(u => u.id === id);
        if (!user) {
            throw new Error('用户不存在');
        }

        if (updates.username && updates.username !== user.username) {
            if (this.db.users.some(u => u.username === updates.username)) {
                throw new Error('用户名已存在');
            }
        }

        // 如果更新密码，需要加密
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }

        Object.assign(user, updates);
        await this.saveDb();

        return user;
    }

    // 删除用户
    async deleteUser(id: string): Promise<void> {
        const index = this.db.users.findIndex(u => u.id === id);
        if (index === -1) {
            throw new Error('用户不存在');
        }

        this.db.users.splice(index, 1);
        await this.saveDb();
    }

    // 获取所有用户（管理员用）
    async getAllUsers(): Promise<UserModel[]> {
        return this.db.users;
    }

    async createInviteCode(params: { createdByUserId?: string; note?: string } = {}) {
        const code = crypto.randomBytes(9).toString('base64url'); // 12 chars
        const codeHash = crypto.createHash('sha256').update(code).digest('hex');

        const invite: InviteCodeModel = {
            id: crypto.randomUUID(),
            codeHash,
            createdAt: Date.now(),
            createdByUserId: params.createdByUserId,
            note: params.note,
        };

        this.db.inviteCodes.push(invite);
        await this.saveDb();

        return { code, invite };
    }

    async listInviteCodes(): Promise<InviteCodeModel[]> {
        return [...this.db.inviteCodes].sort((a, b) => b.createdAt - a.createdAt);
    }

    async revokeInviteCode(inviteId: string): Promise<InviteCodeModel> {
        const invite = this.db.inviteCodes.find(i => i.id === inviteId);
        if (!invite) {
            throw new Error('邀请码不存在');
        }
        if (invite.usedAt || invite.usedByUserId) {
            throw new Error('邀请码已被使用，不能撤销');
        }
        if (!invite.revokedAt) {
            invite.revokedAt = Date.now();
            await this.saveDb();
        }
        return invite;
    }

    // 增加积分
    async addCredits(userId: string, amount: number): Promise<void> {
        const user = await this.getUserById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        user.credits += amount;
        await this.saveDb();
    }

    // 扣除积分
    async deductCredits(userId: string, amount: number): Promise<boolean> {
        const user = await this.getUserById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        if (user.credits < amount) {
            return false;  // 积分不足
        }

        user.credits -= amount;
        await this.saveDb();
        return true;
    }

    // 增加任务计数
    async incrementTaskCount(userId: string): Promise<void> {
        const user = await this.getUserById(userId);
        if (!user) return;

        user.totalTasks++;
        await this.saveDb();
    }
}
