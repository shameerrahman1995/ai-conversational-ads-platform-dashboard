import Link from 'next/link';
import { CapabilityGate } from '@/components/CapabilityGate';
import { Button } from '@/components/ui';

export default function TestingPage() {
  return (
    <CapabilityGate
      title="Testing & QA"
      subtitle="Validate the agent, creative, grounding, consent and platform compatibility before anything goes live."
      icon="check"
      reason="The grounded-agent test simulator and the regression evaluation that gate publishing already run inside the Agent Studio today — an agent can't be published until its golden-set evaluation passes. A standalone QA hub that aggregates creative, privacy and platform checks in one place will surface here; until then, run agent tests from the Agent Studio."
    >
      <Link href="/agents">
        <Button variant="primary" icon="agents">
          Open Agent Studio
        </Button>
      </Link>
    </CapabilityGate>
  );
}
