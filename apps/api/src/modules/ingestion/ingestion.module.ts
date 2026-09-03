import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { ParseService } from './parse.service';
import { SourcesController } from './sources.controller';
import { FactsController } from './facts.controller';
import { SourceParser } from './parsing/source-parser';
import { SOURCE_PARSER } from './parsing/parser.port';
import { StubFactExtractor } from './facts/stub-extractor';
import { FACT_EXTRACTOR } from './facts/extractor.port';

// Source ingestion: crawl/parse/extract product facts, human approval (blueprint §10).
@Module({
  controllers: [SourcesController, FactsController],
  providers: [
    IngestionService,
    ParseService,
    { provide: SOURCE_PARSER, useClass: SourceParser },
    // useFactory (not useClass): StubFactExtractor's constructor has a defaulted
    // `max` param that Nest DI would otherwise try (and fail) to resolve.
    { provide: FACT_EXTRACTOR, useFactory: () => new StubFactExtractor() },
  ],
})
export class IngestionModule {}
