import Link from 'next/link';
import { CapabilityGate } from '@/components/CapabilityGate';
import { Button } from '@/components/ui';

export default function ConversationsPage() {
  return (
    <CapabilityGate
      title="Conversations"
      subtitle="Every customer conversation the AI agent handled — transcripts, grounding, consent and outcomes."
      icon="message"
      reason="There is no workspace-wide conversations index endpoint yet, so this is shown as capability-gated rather than with a fabricated feed. Full, decrypted transcripts with real consent records are already available today per lead — open a lead to read its conversation. A cross-conversation index will surface here once /v1/conversations is exposed."
    >
      <Link href="/leads">
        <Button variant="primary" icon="leads">
          View conversations by lead
        </Button>
      </Link>
    </CapabilityGate>
  );
}
