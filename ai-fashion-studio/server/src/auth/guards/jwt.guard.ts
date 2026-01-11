import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserDbService } from '../../db/user-db.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly userDb: UserDbService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest();
    const authHeader = (req.headers?.authorization as string | undefined) || undefined;
    const token = this.authService.extractTokenFromHeader(authHeader);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('未提供认证令牌');
    }

    const payload = this.authService.verifyToken(token);
    if (!payload) {
      if (isPublic) return true;
      throw new UnauthorizedException('令牌无效或已过期');
    }

    const user = await this.userDb.getUserById(payload.userId);
    if (!user || user.status !== 'ACTIVE') {
      if (isPublic) return true;
      throw new UnauthorizedException('用户不存在或不可用');
    }

    req.user = user;

    const url = (req.originalUrl || req.url || '') as string;
    if (this.isAdminRoute(url) && user.role !== 'ADMIN') {
      throw new ForbiddenException('需要管理员权限');
    }

    return true;
  }

  private isAdminRoute(url: string): boolean {
    return /\/admin(\/|$)/.test(url);
  }
}

