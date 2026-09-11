import type { ReactNode } from 'react';
import { PageHeader, Card, Chip } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';

/**
 * Honest "capability-gated" module surface. Per the product rule that every visible
 * control must work OR be intentionally disabled with a clear explanation, these
 * modules are shown (not hidden) with the real reason they aren't active and a
 * pointer to where the capability lives today — never fabricated data.
 */
export function CapabilityGate({
  title,
  subtitle,
  icon,
  reason,
  children,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  reason: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Chip tone="warning" dot>
            Capability-gated
          </Chip>
        }
      />
      <Card pad>
        <div className="empty">
          <div className="empty-ic">
            <Icon name={icon} size={22} />
          </div>
          <div className="empty-title">Not wired to a backend yet</div>
          <div style={{ maxWidth: '56ch', margin: '0 auto' }}>{reason}</div>
          {children ? <div style={{ marginTop: '1rem' }}>{children}</div> : null}
        </div>
      </Card>
    </div>
  );
}
