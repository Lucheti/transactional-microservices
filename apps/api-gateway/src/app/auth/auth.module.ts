import { Global, Module } from '@nestjs/common';
import { SharedJwtModule } from '@beta/contracts';
import { HttpJwtGuard } from './http-jwt.guard';

@Global()
@Module({
  imports: [SharedJwtModule],
  providers: [HttpJwtGuard],
  exports: [SharedJwtModule, HttpJwtGuard],
})
export class GatewayAuthModule {}
