import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleAsyncOptions, JwtSignOptions } from '@nestjs/jwt';

/**
 * Shared JWT configuration so the gateway (which verifies/signs) reads the
 * same secret + expiry from env everywhere. Only the gateway imports this.
 */
export const SHARED_JWT_MODULE_OPTIONS: JwtModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),
    signOptions: {
      expiresIn: config.get<string>(
        'JWT_EXPIRES_IN',
        '1h',
      ) as JwtSignOptions['expiresIn'],
    },
  }),
};

export const SharedJwtModule = JwtModule.registerAsync(SHARED_JWT_MODULE_OPTIONS);

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}
