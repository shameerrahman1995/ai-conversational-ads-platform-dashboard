import { ApiProperty } from '@nestjs/swagger';
import type { GoldenQuestion } from './evaluation';

export class CreateAgentDto {
  @ApiProperty()
  campaignId!: string;
}

export class PublishAgentDto {
  @ApiProperty({ type: Object, description: 'Agent config (identity, tone, tools, disclosure, …)' })
  config!: Record<string, unknown>;

  @ApiProperty({ type: [Object], description: 'Golden questions for the publish eval gate' })
  goldenSet!: GoldenQuestion[];
}

export class EvaluateAgentDto {
  @ApiProperty({ type: [Object] })
  goldenSet!: GoldenQuestion[];
}

export class StartSessionDto {
  @ApiProperty()
  agentId!: string;

  @ApiProperty()
  visitorId!: string;

  @ApiProperty({ description: 'Explicit AI-disclosure consent' })
  consent!: boolean;
}

export class SendMessageDto {
  @ApiProperty()
  message!: string;
}
