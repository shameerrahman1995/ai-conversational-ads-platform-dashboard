import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';

// Connections (blueprint §8): ad-platform connection lifecycle. Uses the global
// ad-connector registry (AdConnectorsModule).
@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
})
export class ConnectionsModule {}
