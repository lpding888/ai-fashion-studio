import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserModel } from '../../db/models';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserModel | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as UserModel | undefined;
  },
);

