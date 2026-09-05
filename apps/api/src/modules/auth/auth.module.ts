import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '@acp/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

// Auth: password login → JWT. JwtModule is global so the global JwtAuthGuard can
// inject JwtService anywhere.
@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: loadEnv().JWT_SECRET,
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
