import { InternalServerErrorException, Logger } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

const logger = new Logger('ResponseContract');

export const assertResponse = <T>(
  schema: ZodTypeAny,
  payload: unknown,
  label: string,
): T => {
  const result = schema.safeParse(payload);
  if (result.success) {
    return result.data as T;
  }
  logger.error(`Response schema mismatch: ${label}`, result.error);
  throw new InternalServerErrorException('响应数据格式错误');
};
