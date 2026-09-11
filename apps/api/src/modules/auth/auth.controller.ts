import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { EnrollMfaDto, LoginDto, MfaVerifyDto } from './dto';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser, type AuthUser } from '../../common/auth/current-user.decorator';

// Brute-force protection: auth + MFA attempts are far more sensitive than the
// global default (120/min). 10 requests/min per client here.
@ApiTags('auth')
@Controller('v1/auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.code);
  }

  @Get('me')
  me(@Req() req: { user?: { userId: string; orgId: string; role: string; email?: string } }) {
    if (!req.user) throw new UnauthorizedException('Not authenticated');
    return req.user;
  }

  // ---- TOTP two-factor (self-service; requires a real signed-in principal) ----
  private requireUser(user?: AuthUser): AuthUser {
    if (!user?.userId) throw new UnauthorizedException('Sign in to manage two-factor authentication.');
    return user;
  }

  @Get('mfa/status')
  mfaStatus(@CurrentUser() user?: AuthUser) {
    return this.auth.mfaStatus(this.requireUser(user).userId);
  }

  @Post('mfa/enroll')
  enrollMfa(@Body() dto: EnrollMfaDto, @CurrentUser() user?: AuthUser) {
    return this.auth.enrollMfa(this.requireUser(user).userId, dto.password);
  }

  @Post('mfa/enable')
  enableMfa(@Body() dto: MfaVerifyDto, @CurrentUser() user?: AuthUser) {
    return this.auth.enableMfa(this.requireUser(user).userId, dto.password, dto.code);
  }

  @Post('mfa/disable')
  disableMfa(@Body() dto: MfaVerifyDto, @CurrentUser() user?: AuthUser) {
    return this.auth.disableMfa(this.requireUser(user).userId, dto.password, dto.code);
  }
}
