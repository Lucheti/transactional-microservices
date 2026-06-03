import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from '@beta/contracts';

/**
 * The gateway is the ONLY JWT verifier in the platform. It validates the bearer
 * token here and attaches the payload to the request; internal services trust
 * the identity propagated to them and never re-verify.
 */
@Injectable()
export class HttpJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const token = header.slice('bearer '.length).trim();
    try {
      req.user = await this.jwt.verifyAsync<JwtPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}
