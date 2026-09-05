import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';
import { Public } from '../../common/auth/public.decorator';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  me(@Req() req: { user?: { userId: string; orgId: string; role: string; email?: string } }) {
    if (!req.user) throw new UnauthorizedException('Not authenticated');
    return req.user;
  }
}
