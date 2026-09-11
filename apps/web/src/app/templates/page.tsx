import Link from 'next/link';
import { CapabilityGate } from '@/components/CapabilityGate';
import { Button } from '@/components/ui';

export default function TemplatesPage() {
  return (
    <CapabilityGate
      title="Templates"
      subtitle="Reusable campaign blueprints — start from a proven structure instead of a blank canvas."
      icon="doc"
      reason="There is no /v1/templates endpoint in the current backend, so this module is shown with an honest explanation rather than fabricated template data. When the endpoint lands, this page lists and applies saved campaign blueprints. Today you can start a campaign from scratch and it will guide you through the same structure."
    >
      <Link href="/campaigns/new">
        <Button variant="primary" icon="plus">
          New campaign
        </Button>
      </Link>
    </CapabilityGate>
  );
}
