import { Module } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { CampaignController } from './campaign.controller';
import { COPY_GENERATOR } from './copy-generator.port';
import { StubCopyGenerator } from './stub-copy-generator';

// Campaign intelligence (blueprint §5/§10): versioned brief/copy from approved facts.
@Module({
  controllers: [CampaignController],
  providers: [CampaignService, { provide: COPY_GENERATOR, useClass: StubCopyGenerator }],
})
export class CampaignIntelModule {}
