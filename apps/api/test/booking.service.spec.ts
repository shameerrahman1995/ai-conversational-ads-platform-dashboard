import { describe, it, expect, vi } from 'vitest';
import { BookingService } from '../src/modules/engagement/booking.service';

function deps(opts: { booking?: any } = {}) {
  const prisma = {
    booking: {
      create: vi.fn().mockResolvedValue({ id: 'b1', status: 'confirmed' }),
      findFirst: vi.fn().mockResolvedValue(opts.booking ?? { id: 'b1', orgId: 'org_1', provider: 'google_calendar', externalEventId: 'evt1' }),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'b1', ...data })),
    },
  } as any;
  const audit = { record: vi.fn() } as any;
  const cal = {
    availability: vi.fn().mockResolvedValue([{ start: 's', end: 'e' }]),
    hold: vi.fn().mockResolvedValue({ holdId: 'h1' }),
    confirm: vi.fn().mockResolvedValue({ externalEventId: 'evt1' }),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  const registry = { get: vi.fn().mockReturnValue(cal) } as any;
  return { prisma, audit, registry, cal };
}

function make(d: ReturnType<typeof deps>) {
  return new BookingService(d.prisma, d.audit, d.registry);
}

describe('BookingService', () => {
  it('book holds + confirms the slot and stores a confirmed booking with the event id', async () => {
    const d = deps();
    const out: any = await make(d).book('org_1', {
      provider: 'google_calendar',
      slotStart: '2026-09-10T15:00:00Z',
      slotEnd: '2026-09-10T15:30:00Z',
    });
    expect(d.cal.hold).toHaveBeenCalled();
    expect(d.cal.confirm).toHaveBeenCalledWith({ secretRef: '', holdId: 'h1' });
    expect(d.prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: 'org_1', externalEventId: 'evt1', status: 'confirmed' }),
      }),
    );
    expect(out.status).toBe('confirmed');
  });

  it('cancel cancels the external event and marks the booking canceled (org-scoped)', async () => {
    const d = deps();
    const out: any = await make(d).cancel('org_1', 'b1');
    expect(d.cal.cancel).toHaveBeenCalledWith({ secretRef: '', externalEventId: 'evt1' });
    expect(d.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'b1', orgId: 'org_1' },
      data: { status: 'canceled' },
    });
    expect(out.status).toBe('canceled');
  });
});
