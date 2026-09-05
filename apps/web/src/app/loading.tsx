/**
 * Route-level loading fallback, shown via Suspense while a segment streams in.
 * Server component — intentionally lightweight.
 */
export default function Loading() {
  return (
    <div
      className="empty"
      aria-busy="true"
      style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}
    >
      <div>
        <span className="spin" aria-hidden="true" style={{ marginBottom: '0.6rem' }} />
        <div>Loading…</div>
      </div>
    </div>
  );
}
