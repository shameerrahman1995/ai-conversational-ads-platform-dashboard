import { ApiProperty } from '@nestjs/swagger';
import { Allow, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
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

export class VoiceTurnDto {
  @ApiProperty({ description: 'Base64-encoded audio of the visitor turn' })
  @IsString()
  audioBase64!: string;

  @ApiProperty({ example: 'audio/webm' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ description: 'Explicit call-recording consent (gates audio retention)' })
  @IsBoolean()
  recordingConsent!: boolean;

  @ApiProperty({ required: false, description: 'Dev/test transcript for the offline STT stub' })
  @IsOptional()
  @IsString()
  transcriptHint?: string;

  @ApiProperty({ required: false, example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;
}
