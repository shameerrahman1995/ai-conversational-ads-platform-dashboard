import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@acp/db';

/**
 * Prisma connects lazily on first query, so the API boots without a live DB
 * (see design doc §12 deploy note). We only add a graceful disconnect on
 * shutdown; connection URL comes from DATABASE_URL via the Prisma client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
