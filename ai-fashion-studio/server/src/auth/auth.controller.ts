import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Headers,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UserDbService } from '../db/user-db.service';
import { InviteCodeModel, UserModel } from '../db/models';
import * as bcrypt from 'bcrypt';
import { Public } from './decorators/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreditService } from '../credit/credit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminCreateInviteBodySchema,
  AdminUsersSummaryQuerySchema,
  AdminUpdateMeBodySchema,
  AdminCreateUserBodySchema,
  AdminUpdateUserBodySchema,
  LoginBodySchema,
  RegisterBodySchema,
} from '../contracts/api.schemas';
import { z } from 'zod';


@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  private logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private userDb: UserDbService,
    private readonly creditService: CreditService,
    private readonly prisma: PrismaService,
  ) {}

  // 注册（邀请码，一次性）
  @Public()
  @Post('register')
  @ApiOperation({ summary: '注册（公开）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string', minLength: 6 },
        nickname: { type: 'string' },
        email: { type: 'string' },
        inviteCode: { type: 'string' },
      },
      required: ['username', 'password'],
    },
  })
  async register(
    @Body(new ZodValidationPipe(RegisterBodySchema))
    body: z.infer<typeof RegisterBodySchema>,
  ) {
    const inviteRequired = this.isInviteRequired();

    try {
      const user = await this.userDb.registerWithInvite({
        username: body.username,
        password: body.password,
        nickname: body.nickname,
        email: body.email,
        inviteCode: body.inviteCode,
        inviteRequired,
        initialCredits: 100,
      });

      this.logger.log(`📝 New registration: ${user.username} (ACTIVE)`);

      return {
        success: true,
        message: '注册成功，请直接登录',
        user: this.authService.sanitizeUser(user),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // 登录
  @Public()
  @Post('login')
  @ApiOperation({ summary: '登录（公开）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
    },
  })
  async login(
    @Body(new ZodValidationPipe(LoginBodySchema))
    body: z.infer<typeof LoginBodySchema>,
  ) {
    const { username, password } = body;

    // 验证用户名密码
    const user = await this.userDb.verifyPassword(username, password);

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status === 'PENDING') {
      throw new UnauthorizedException('账户待管理员审核');
    }

    if (user.status === 'DISABLED') {
      throw new UnauthorizedException('账户已被禁用');
    }

    // 记录成功登录时间（仅 ACTIVE 才算成功登录）
    const updated = await this.userDb.updateUser(user.id, {
      lastLoginAt: Date.now(),
    });

    // 生成Token
    const token = this.authService.generateToken(updated);

    this.logger.log(`✅ User logged in: ${updated.username} (${updated.role})`);

    return {
      success: true,
      token,
      user: this.authService.sanitizeUser(updated),
    };
  }

  // 获取当前用户信息
  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  async getCurrentUser(@Headers('authorization') authorization: string) {
    const token = this.authService.extractTokenFromHeader(authorization);

    if (!token) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    const payload = this.authService.verifyToken(token);

    if (!payload) {
      throw new UnauthorizedException('令牌无效或已过期');
    }

    const user = await this.userDb.getUserById(payload.userId);

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        user.status === 'PENDING' ? '账户待管理员审核' : '账户已被禁用',
      );
    }

    return {
      success: true,
      user: this.authService.sanitizeUser(user),
    };
  }

  // 登出（前端删除token即可，服务端无需处理）
  @Public()
  @Post('logout')
  @ApiOperation({ summary: '登出（公开）' })
  async logout() {
    return {
      success: true,
      message: '登出成功',
    };
  }

  // ========== 管理员API ==========

  @Post('admin/invite-codes')
  @ApiOperation({ summary: '创建邀请码（管理员）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { note: { type: 'string' } },
    },
  })
  async createInviteCode(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(AdminCreateInviteBodySchema))
    body: z.infer<typeof AdminCreateInviteBodySchema>,
  ) {
    const admin = await this.verifyAdmin(authorization);

    try {
      const { code, invite } = await this.userDb.createInviteCode({
        createdByUserId: admin.id,
        note: body.note,
      });

      return {
        success: true,
        code, // 仅返回一次明文
        invite: this.sanitizeInvite(invite),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Get('admin/invite-codes')
  @ApiOperation({ summary: '获取邀请码列表（管理员）' })
  async listInviteCodes(@Headers('authorization') authorization: string) {
    await this.verifyAdmin(authorization);

    const invites = await this.userDb.listInviteCodes();
    return {
      success: true,
      invites: invites.map((i) => this.sanitizeInvite(i)),
    };
  }

  @Delete('admin/invite-codes/:inviteId')
  @ApiOperation({ summary: '撤销邀请码（管理员）' })
  @ApiParam({ name: 'inviteId', type: String })
  async revokeInviteCode(
    @Headers('authorization') authorization: string,
    @Param('inviteId') inviteId: string,
  ) {
    await this.verifyAdmin(authorization);

    try {
      const invite = await this.userDb.revokeInviteCode(inviteId);
      return { success: true, invite: this.sanitizeInvite(invite) };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // 更新当前管理员账号信息（自助改账号/改密）
  @Put('admin/me')
  @ApiOperation({ summary: '更新管理员自身信息' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        currentPassword: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string' },
        nickname: { type: 'string' },
        email: { type: 'string' },
      },
    },
  })
  async updateAdminMe(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(AdminUpdateMeBodySchema))
    body: z.infer<typeof AdminUpdateMeBodySchema>,
  ) {
    const admin = await this.verifyAdmin(authorization);

    const wantsChangeUsername =
      body.username !== undefined && body.username !== admin.username;
    const wantsChangePassword = body.password !== undefined;

    if (
      !wantsChangeUsername &&
      !wantsChangePassword &&
      body.nickname === undefined &&
      body.email === undefined
    ) {
      throw new BadRequestException('未提供需要更新的字段');
    }

    if ((wantsChangeUsername || wantsChangePassword) && !body.currentPassword) {
      throw new BadRequestException('需要提供当前密码');
    }

    if (wantsChangePassword && body.password && body.password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }

    if (wantsChangeUsername || wantsChangePassword) {
      const ok = await bcrypt.compare(body.currentPassword, admin.password);
      if (!ok) throw new UnauthorizedException('当前密码错误');
    }

    try {
      const updates: Partial<UserModel> = {};
      if (body.username !== undefined) updates.username = body.username;
      if (body.password !== undefined) updates.password = body.password;
      if (body.nickname !== undefined) updates.nickname = body.nickname;
      if (body.email !== undefined) updates.email = body.email;

      const updated = await this.userDb.updateUser(admin.id, updates);

      this.logger.log(
        `✅ Admin self-updated: ${admin.username} -> ${updated.username}`,
      );

      return {
        success: true,
        token: this.authService.generateToken(updated),
        user: this.authService.sanitizeUser(updated),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // 创建用户（管理员用）
  @Post('admin/create-user')
  @ApiOperation({ summary: '创建用户（管理员）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        nickname: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string', enum: ['USER', 'ADMIN'] },
        status: { type: 'string', enum: ['ACTIVE', 'DISABLED', 'PENDING'] },
        credits: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['username', 'password'],
    },
  })
  async createUser(
    @Headers('authorization') authorization: string,
    @Body(new ZodValidationPipe(AdminCreateUserBodySchema))
    body: z.infer<typeof AdminCreateUserBodySchema>,
  ) {
    // 验证管理员权限
    const admin = await this.verifyAdmin(authorization);

    const { username, password, ...rest } = body;

    if (!username || !password) {
      throw new BadRequestException('用户名和密码不能为空');
    }

    if (password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }

    try {
      const user = await this.userDb.createUser({
        username,
        password,
        ...rest,
        createdBy: admin.id,
      });

      this.logger.log(
        `✅ Admin ${admin.username} created user: ${user.username}`,
      );

      return {
        success: true,
        user: this.authService.sanitizeUser(user),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // 获取所有用户（管理员用）
  @Get('admin/users')
  @ApiOperation({ summary: '获取用户列表（管理员）' })
  async getAllUsers(@Headers('authorization') authorization: string) {
    await this.verifyAdmin(authorization);

    const users = await this.userDb.getAllUsers();

    return {
      success: true,
      users: users.map((u) => this.authService.sanitizeUser(u)),
    };
  }

  /**
   * 管理员：用户列表（带聚合指标）
   * - totalTasks：以 tasks 表聚合为准（成功/失败/生成中都算）
   * - totalEarned/totalSpent：以 credit_transactions 聚合为准
   * - balance：以 user.credits 为准
   */
  @Get('admin/users/summary')
  @ApiOperation({ summary: '用户列表（含汇总指标，管理员）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: ['USER', 'ADMIN'] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'DISABLED', 'PENDING'],
  })
  async getAdminUsersSummary(
    @Headers('authorization') authorization: string,
    @Query(new ZodValidationPipe(AdminUsersSummaryQuerySchema))
    query: z.infer<typeof AdminUsersSummaryQuerySchema>,
  ) {
    await this.verifyAdmin(authorization);

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 20;
    const q = (query?.q ?? '').trim().toLowerCase();

    let users = await this.userDb.getAllUsers();
    if (query?.role) users = users.filter((u) => u.role === query.role);
    if (query?.status) users = users.filter((u) => u.status === query.status);
    if (q) {
      users = users.filter((u) => {
        const fields = [u.username, u.nickname || '', u.email || '', u.id].map(
          (s) => String(s || '').toLowerCase(),
        );
        return fields.some((s) => s.includes(q));
      });
    }

    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const total = users.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const slice = users.slice(start, start + limit);
    const userIds = slice.map((u) => u.id);

    // 聚合：任务数（按 tasks 表）
    const taskCounts =
      userIds.length === 0
        ? []
        : await this.prisma.task.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _count: { _all: true },
          });
    const taskCountByUserId = new Map<string, number>(
      (taskCounts as any[]).map((r) => [
        String(r.userId),
        Number(r._count?._all || 0),
      ]),
    );

    // 聚合：积分流水（按 credit_transactions 表）
    const creditAgg =
      userIds.length === 0
        ? []
        : await this.prisma.creditTransaction.groupBy({
            by: ['userId', 'type'],
            where: { userId: { in: userIds } },
            _sum: { amount: true },
          });
    const earnedByUserId = new Map<string, number>();
    const spentByUserId = new Map<string, number>();
    for (const row of creditAgg as any[]) {
      const uid = String(row.userId);
      const amt = Number(row._sum?.amount || 0);
      if (row.type === 'EARN') earnedByUserId.set(uid, amt);
      if (row.type === 'SPEND') spentByUserId.set(uid, amt);
    }

    const summarized = slice.map((u) => ({
      ...this.authService.sanitizeUser(u),
      totalTasks: taskCountByUserId.get(u.id) ?? 0,
      totalEarned: earnedByUserId.get(u.id) ?? 0,
      totalSpent: spentByUserId.get(u.id) ?? 0,
    }));

    return {
      success: true,
      users: summarized,
      total,
      page,
      limit,
      totalPages,
    };
  }

  // 更新用户（管理员用）
  @Put('admin/update-user/:userId')
  @ApiOperation({ summary: '更新用户（管理员）' })
  @ApiParam({ name: 'userId', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        nickname: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string', enum: ['USER', 'ADMIN'] },
        status: { type: 'string', enum: ['ACTIVE', 'DISABLED', 'PENDING'] },
        credits: { type: 'number' },
        notes: { type: 'string' },
      },
    },
  })
  async updateUser(
    @Headers('authorization') authorization: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(AdminUpdateUserBodySchema))
    body: z.infer<typeof AdminUpdateUserBodySchema>,
  ) {
    const admin = await this.verifyAdmin(authorization);

    if (!userId) {
      throw new BadRequestException('用户ID不能为空');
    }

    if (userId === admin.id) {
      throw new BadRequestException('不允许修改当前登录的管理员账户');
    }

    if (body.password && body.password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }

    if (
      body.credits !== undefined &&
      (!Number.isInteger(body.credits) || body.credits < 0)
    ) {
      throw new BadRequestException('credits 必须为非负整数');
    }

    if (body.role && body.role !== 'USER' && body.role !== 'ADMIN') {
      throw new BadRequestException('role 无效');
    }

    if (
      body.status &&
      body.status !== 'ACTIVE' &&
      body.status !== 'DISABLED' &&
      body.status !== 'PENDING'
    ) {
      throw new BadRequestException('status 无效');
    }

    try {
      const updates: Partial<UserModel> = {};

      if (body.username !== undefined) updates.username = body.username;
      if (body.password !== undefined) updates.password = body.password;
      if (body.nickname !== undefined) updates.nickname = body.nickname;
      if (body.email !== undefined) updates.email = body.email;
      if (body.role !== undefined) updates.role = body.role;
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;

      const hasNonCreditUpdates = Object.keys(updates).length > 0;
      if (hasNonCreditUpdates) {
        await this.userDb.updateUser(userId, updates);
      }

      if (body.credits !== undefined) {
        await this.creditService.setCreditsByAdmin(
          userId,
          body.credits,
          `管理员更新用户资料：设置积分为 ${body.credits}`,
          admin.id,
        );
      }

      const updated = await this.userDb.getUserById(userId);
      if (!updated) {
        throw new BadRequestException('用户不存在');
      }

      this.logger.log(
        `✅ Admin ${admin.username} updated user: ${updated.username}`,
      );

      return {
        success: true,
        user: this.authService.sanitizeUser(updated),
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // 删除用户（管理员用）
  @Delete('admin/delete-user/:userId')
  @ApiOperation({ summary: '删除用户（管理员）' })
  @ApiParam({ name: 'userId', type: String })
  async deleteUser(
    @Headers('authorization') authorization: string,
    @Param('userId') userId: string,
  ) {
    const admin = await this.verifyAdmin(authorization);

    if (!userId) {
      throw new BadRequestException('用户ID不能为空');
    }

    if (userId === admin.id) {
      throw new BadRequestException('不允许删除当前登录的管理员账户');
    }

    const target = await this.userDb.getUserById(userId);
    if (!target) {
      throw new BadRequestException('用户不存在');
    }

    if (target.role === 'ADMIN') {
      const users = await this.userDb.getAllUsers();
      const adminCount = users.filter((u) => u.role === 'ADMIN').length;
      if (adminCount <= 1) {
        throw new BadRequestException('至少需要保留一个管理员账户');
      }
    }

    try {
      await this.userDb.deleteUser(userId);
      this.logger.log(
        `✅ Admin ${admin.username} deleted user: ${target.username}`,
      );
      return { success: true };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  // 辅助方法：验证管理员权限
  private async verifyAdmin(authorization: string) {
    const token = this.authService.extractTokenFromHeader(authorization);

    if (!token) {
      throw new UnauthorizedException('未提供认证令牌');
    }

    const payload = this.authService.verifyToken(token);

    if (!payload) {
      throw new UnauthorizedException('令牌无效或已过期');
    }

    const user = await this.userDb.getUserById(payload.userId);

    if (!user || user.role !== 'ADMIN') {
      throw new UnauthorizedException('需要管理员权限');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        user.status === 'PENDING' ? '账户待管理员审核' : '账户已被禁用',
      );
    }

    return user;
  }

  private sanitizeInvite(invite: InviteCodeModel) {
    const { codeHash, ...rest } = invite;
    return rest;
  }

  private isInviteRequired(): boolean {
    const raw = (process.env.INVITE_CODE_REQUIRED || '').trim();
    const isProd = process.env.NODE_ENV === 'production';

    // 生产环境默认开启（除非显式关掉），非生产环境默认关闭（除非显式开启）
    if (isProd) return raw !== 'false';
    return raw === 'true';
  }
}
