import Link from 'next/link';
import { CapabilityGate } from '@/components/CapabilityGate';
import { Button } from '@/components/ui';

export default function AudiencesPage() {
  return (
    <CapabilityGate
      title="Audiences"
      subtitle="Reusable, versioned audience definitions shared across campaigns."
      icon="users"
      reason="There is no /v1/audiences endpoint yet, so this is shown as capability-gated rather than with placeholder segments. Audience targeting is currently configured per-campaign inside the campaign builder; a shared, versioned audience library will surface here once the backend exposes it."
    >
      <Link href="/campaigns/new">
        <Button variant="primary" icon="users">
          Configure targeting in a campaign
        </Button>
      </Link>
    </CapabilityGate>
  );
}
