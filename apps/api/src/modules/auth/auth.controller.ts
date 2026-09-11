import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, MfaCodeDto } from './dto';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser, type AuthUser } from '../../common/auth/current-user.decorator';

@ApiTags('auth')
@Controller('v1/auth')
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
  enrollMfa(@CurrentUser() user?: AuthUser) {
    return this.auth.enrollMfa(this.requireUser(user).userId);
  }

  @Post('mfa/enable')
  enableMfa(@Body() dto: MfaCodeDto, @CurrentUser() user?: AuthUser) {
    return this.auth.enableMfa(this.requireUser(user).userId, dto.code);
  }

  @Post('mfa/disable')
  disableMfa(@Body() dto: MfaCodeDto, @CurrentUser() user?: AuthUser) {
    return this.auth.disableMfa(this.requireUser(user).userId, dto.code);
  }
}
