import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/auth/public.decorator';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up (no dependency checks). */
  @Public()
  @Get(['health', 'livez'])
  live(): { status: string; service: string; time: string } {
    return { status: 'ok', service: 'api', time: new Date().toISOString() };
  }

  /** Readiness: can we actually serve? Checks the database. */
  @Public()
  @Get('readyz')
  async ready(): Promise<{ status: string; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    if (!ok) throw new ServiceUnavailableException({ status: 'not_ready', checks });
    return { status: 'ready', checks };
  }
}
