import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsArray, IsBoolean, IsString } from 'class-validator';
import type { GoldenQuestion } from './evaluation';

export class CreateAgentDto {
  @ApiProperty()
  @IsString()
  campaignId!: string;
}

export class PublishAgentDto {
  @ApiProperty({ type: Object, description: 'Agent config (identity, tone, tools, disclosure, …)' })
  @Allow()
  config!: Record<string, unknown>;

  @ApiProperty({ type: [Object], description: 'Golden questions for the publish eval gate' })
  @IsArray()
  goldenSet!: GoldenQuestion[];
}

export class EvaluateAgentDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  goldenSet!: GoldenQuestion[];
}

export class StartSessionDto {
  @ApiProperty()
  @IsString()
  agentId!: string;

  @ApiProperty()
  @IsString()
  visitorId!: string;

  @ApiProperty({ description: 'Explicit AI-disclosure consent' })
  @IsBoolean()
  consent!: boolean;
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  message!: string;
}
