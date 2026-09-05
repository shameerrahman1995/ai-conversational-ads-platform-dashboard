import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  orgId: string;
  role: string;
  email?: string;
}

/** Injects the authenticated principal set by JwtAuthGuard (undefined in dev header mode). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest().user;
  },
);
