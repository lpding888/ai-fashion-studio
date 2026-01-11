import { Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { UserModel } from '../db/models';

const JWT_EXPIRES_IN = '7d';  // 7天有效期

@Injectable()
export class AuthService {
    private logger = new Logger(AuthService.name);
    private readonly jwtSecret: string;

    constructor() {
        const secret = (process.env.JWT_SECRET || '').trim();
        const isProd = process.env.NODE_ENV === 'production';

        if (isProd) {
            if (!secret || secret.length < 32) {
                throw new Error('生产环境必须配置强 JWT_SECRET（至少 32 位）');
            }
            this.jwtSecret = secret;
            return;
        }

        // 非生产环境允许弱配置，便于本地开发；生产环境由上面的分支强制要求
        this.jwtSecret = secret || 'dev-insecure-jwt-secret';
    }

    // 生成JWT Token
    generateToken(user: UserModel): string {
        const payload = {
            userId: user.id,
            username: user.username,
            role: user.role
        };

        return jwt.sign(payload, this.jwtSecret, {
            expiresIn: JWT_EXPIRES_IN
        });
    }

    // 验证Token
    verifyToken(token: string): { userId: string; username: string; role: string } | null {
        try {
            return jwt.verify(token, this.jwtSecret) as any;
        } catch (error) {
            this.logger.warn(`Token verification failed: ${error.message}`);
            return null;
        }
    }

    // 从请求头获取Token
    extractTokenFromHeader(authorization?: string): string | null {
        if (!authorization) return null;

        const parts = authorization.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }

        return parts[1];
    }

    // 脱敏用户信息（不返回密码）
    sanitizeUser(user: UserModel): Omit<UserModel, 'password'> {
        const { password, ...safeUser } = user;
        return safeUser;
    }
}
