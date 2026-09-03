import { Global, Module } from '@nestjs/common';
import { ConnectorRegistry } from './connector-registry';
import { GenericExportConnector, GoogleAdsConnector, MetaConnector } from './connectors/adapters';

// Shared ad-connector registry (blueprint §14). Global so both the publishing
// control plane and the connections lifecycle resolve the same adapters.
@Global()
@Module({
  providers: [GoogleAdsConnector, MetaConnector, GenericExportConnector, ConnectorRegistry],
  exports: [ConnectorRegistry],
})
export class AdConnectorsModule {}
