import Link from 'next/link';
import { CapabilityGate } from '@/components/CapabilityGate';
import { Button } from '@/components/ui';

export default function PlacementPreviewPage() {
  return (
    <CapabilityGate
      title="Placement Preview"
      subtitle="See how a creative behaves in representative Google, Meta, TikTok and direct-publisher placements before you deploy."
      icon="globe"
      reason="A faithful placement preview needs a compiled creative package plus a sandboxed, capability-accurate host frame (Permissions-Policy, CSP and sandbox that match the real placement). That host harness isn't built yet, so this is shown as capability-gated rather than as a misleading in-tab render — a normal browser tab does not equal an ad host. The compiler already enforces the per-network rules a preview would need."
    >
      <Link href="/creative">
        <Button variant="primary" icon="creative">
          Open Creative Studio
        </Button>
      </Link>
    </CapabilityGate>
  );
}
