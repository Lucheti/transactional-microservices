import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { IdentityContext, JwtPayload } from '@beta/contracts';

/**
 * Resolves the verified JWT payload into the IdentityContext that gets
 * propagated to services in every NATS envelope. Must be used behind
 * HttpJwtGuard (which populates req.user).
 */
export const CurrentUser = createParamDecorator<unknown, IdentityContext>(
  (_data, ctx: ExecutionContext): IdentityContext => {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!req.user) {
      throw new Error('CurrentUser used without HttpJwtGuard');
    }
    return {
      userId: req.user.sub,
      email: req.user.email,
      roles: req.user.roles ?? [],
    };
  },
);
