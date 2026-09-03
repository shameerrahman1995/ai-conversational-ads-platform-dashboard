import { Global, Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { EMBEDDING } from './embedding.port';
import { StubEmbedder } from './stub-embedder';

// Knowledge/RAG (blueprint §16): chunk, embed, index, hybrid retrieval + citations.
// Global so the ingestion pipeline can index chunks after parsing.
@Global()
@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService, { provide: EMBEDDING, useClass: StubEmbedder }],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
