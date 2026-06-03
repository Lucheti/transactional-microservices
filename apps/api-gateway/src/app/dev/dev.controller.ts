import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '@beta/contracts';
import { IssueTokenRequest } from './issue-token.dto';

/**
 * Dev-only token minting so the auth mechanism is testable without a real auth
 * service / user store. Gated behind DEV_TOKEN_ENDPOINT_ENABLED=true; otherwise
 * returns 404 so its existence isn't leaked. Never enable in production.
 */
@Controller('dev')
export class DevController {
  constructor(private readonly jwt: JwtService) {}

  @Post('token')
  async issueToken(
    @Body() body: IssueTokenRequest,
  ): Promise<{ accessToken: string }> {
    if (process.env['DEV_TOKEN_ENDPOINT_ENABLED'] !== 'true') {
      throw new NotFoundException();
    }
    const payload: JwtPayload = {
      sub: body.userId ?? randomUUID(),
      email: body.email ?? 'dev@beta.local',
      roles: body.roles ?? ['user'],
    };
    return { accessToken: await this.jwt.signAsync(payload) };
  }
}
