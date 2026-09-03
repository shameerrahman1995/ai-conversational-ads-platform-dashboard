# Phase 1 — Hosted Chat Agent (P1.G) Implementation Plan

**Goal:** The post-click conversational agent: consent-gated sessions, grounded retrieval, guardrails (PII redaction, prompt-injection isolation, disallowed-topic screening), circuit-breaker fallback, and an evaluation-gated publish flow.

**Architecture:** `AgentRuntimeModule`. Provider-neutral `ModelGatewayPort` + deterministic `StubModelGateway` (grounds replies in retrieved context; a real Anthropic adapter swaps in later). `guardrails.ts` (redactPII, wrapUntrusted, isDisallowedTopic, SYSTEM_POLICY, FALLBACK_REPLY). `AgentRuntimeService` (startSession requires consent; sendMessage: retrieve via KnowledgeService → wrap untrusted context → gateway → redact + persist → fallback on failure). `AgentBuilderService` (createAgent, evaluate, publishVersion gated by `computeEvalResult` groundedness threshold). Org-scoped + audited; visitor sessions are tenant-scoped but role-free.

**Spec:** design doc §6 (agent builder) / §16 (agent & knowledge architecture).

## Tasks
- **T1** `model-gateway.port.ts` + `StubModelGateway` + test.
- **T2** `guardrails.ts` (PII redaction, prompt-injection isolation, disallowed topics) + test.
- **T3** `evaluation.ts` (GoldenQuestion, computeEvalResult, threshold) + test.
- **T4** `AgentRuntimeService` (startSession, sendMessage) + test.
- **T5** `AgentBuilderService` (createAgent, evaluate, publishVersion eval-gated) + test.
- **T6** `AgentController` (create/evaluate/publish — role-gated) + `AgentSessionController` (start/message — tenant-scoped) + DTOs + module.

## Acceptance
- Sessions require explicit AI-disclosure consent; messages redact PII before storage.
- Retrieved context is isolated as untrusted data (prompt-injection defense); disallowed topics + gateway failures return the approved fallback.
- Replies are grounded with citations; publish refused unless groundedness ≥ threshold.
- 14 unit tests (104 total); build/typecheck/test green; API boots.
