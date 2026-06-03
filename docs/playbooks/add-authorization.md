# Playbook: add role-based authorization

Authentication (*who you are*) already happens once, at the gateway (`HttpJwtGuard`). Authorization (*what you may do*) belongs at the same trust boundary — the gateway — using the `roles` already carried in the JWT → `IdentityContext`. This playbook adds a `@Roles()` decorator + `RolesGuard`. The dev token endpoint already mints tokens with arbitrary roles, so it's easy to test.

All files are in the gateway: `apps/api-gateway/src/app/auth/`.

## 1. `@Roles()` decorator — `auth/roles.decorator.ts`

```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

## 2. `RolesGuard` — `auth/roles.guard.ts`

Reads the required roles off the handler/class metadata and checks them against the verified `req.user.roles` (populated by `HttpJwtGuard`).

```ts
import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '@beta/contracts';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true; // no @Roles → no restriction

    const req = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const roles = req.user?.roles ?? [];
    if (!required.some((r) => roles.includes(r))) {
      throw new ForbiddenException('insufficient role');
    }
    return true;
  }
}
```

## 3. Wire it into `GatewayAuthModule`

`auth/auth.module.ts` — add `RolesGuard` to `providers` and `exports` (it's `@Global`, so it's then injectable anywhere). `Reflector` is provided by Nest automatically.

```ts
@Global()
@Module({
  imports: [SharedJwtModule],
  providers: [HttpJwtGuard, RolesGuard],
  exports: [SharedJwtModule, HttpJwtGuard, RolesGuard],
})
export class GatewayAuthModule {}
```

## 4. Protect a route

Apply both guards **in order** — `HttpJwtGuard` first (it populates `req.user`), then `RolesGuard`:

```ts
@UseGuards(HttpJwtGuard, RolesGuard)
@Roles('admin')
@Post('things/:id/archive')
dangerousAction(@CurrentUser() identity: IdentityContext, @Param('id') id: string) { /* … */ }
```
`@Roles()` can go on a single handler or the whole controller. Routes without `@Roles()` only require authentication.

## 5. (Optional) service-side checks

The full identity — including `roles` — rides in every `RequestEnvelope` (`env.identity.roles`), so a service *can* re-check for defense-in-depth on a high-risk operation. The default invariant is that internal services **trust the gateway**, so only add a service-side check when the extra assurance is worth the coupling; keep routine authorization at the gateway.

## Verify

```sh
# token WITHOUT the role → 403
TOKEN=$(curl -s -X POST localhost:3000/api/dev/token -H 'content-type: application/json' \
  --data '{"roles":["user"]}' | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).accessToken))')
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/things/x/archive -H "authorization: Bearer $TOKEN"   # 403

# token WITH the role → allowed
TOKEN=$(curl -s -X POST localhost:3000/api/dev/token -H 'content-type: application/json' \
  --data '{"roles":["admin"]}' | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).accessToken))')
```

## Scaling beyond flat roles

For resource-scoped permissions ("can edit workspace X") rather than global roles, evolve this into a permission check:
- Put a **permission catalog** (string constants, e.g. `widget:write`) and a **matcher** (supporting wildcards like `widget:*`) in `@beta/contracts` so producers and the gateway share them.
- Carry granted permissions in the JWT (or resolve them at the gateway from the user's roles/grants), and have the guard resolve the *required* permission per route and match it.
- Keep enforcement at the gateway. This is the natural growth path; the `@Roles`/`RolesGuard` above is the minimal starting point.

## Don't

- Don't authorize inside services by default — do it at the gateway (the trust boundary).
- Don't read roles from the request body or query — only from the verified token (`req.user` / `IdentityContext`).
- Don't put `RolesGuard` before `HttpJwtGuard` — `req.user` wouldn't be set yet.
- Don't invent a parallel auth scheme — extend this one (roles → permissions) so there's a single model.
