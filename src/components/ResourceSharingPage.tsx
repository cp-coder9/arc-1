import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { CalendarClock, CheckCircle2, Clock, HardDrive, Loader2, ShieldCheck, TimerReset } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import {
  buildResourceBookingConflictAudit,
  buildResourceUsageLedgerEntry,
  type ResourceBookingStatus,
  type ResourceBookingWindow,
  type ResourceUsageBillingPolicy,
} from '@/services/resourceBookingService';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type LoadState = 'loading' | 'ready' | 'error';

type ResourceListing = {
  id: string;
  ownerId: string;
  ownerName?: string;
  name: string;
  capability: string;
  accessModel?: string;
  location?: string;
  currency?: string;
  hourlyRateCents?: number;
  meteredUnitRateCents?: number;
  minimumBillableMinutes?: number;
  platformFeeBps?: number;
  visibilityRoles?: string[];
  status: 'active' | 'paused' | 'retired';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ResourceBookingRecord = ResourceBookingWindow & {
  requesterId: string;
  requesterName?: string;
  ownerId?: string;
  purpose?: string;
  audit?: ReturnType<typeof buildResourceBookingConflictAudit>;
  createdAt?: string;
  updatedAt?: string;
};

const defaultStart = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
};

const isoFromLocal = (value: string) => new Date(value).toISOString();
const centsToCurrency = (cents = 0, currency = 'ZAR') => new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(cents / 100);

export default function ResourceSharingPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [listings, setListings] = useState<ResourceListing[]>([]);
  const [bookings, setBookings] = useState<ResourceBookingRecord[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart());
  const [endsAt, setEndsAt] = useState(() => {
    const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    return date.toISOString().slice(0, 16);
  });
  const [purpose, setPurpose] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newResource, setNewResource] = useState({ name: '', capability: '', accessModel: 'Remote desktop / supervised access', hourlyRate: '', notes: '' });

  useEffect(() => {
    setState('loading');
    const unsubscribeListings = onSnapshot(collection(db, 'resource_listings'), (snapshot) => {
      setListings(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ResourceListing)));
      setState('ready');
    }, (error) => {
      console.error('Failed to load resource listings:', error);
      setState('error');
    });

    const unsubscribeBookings = onSnapshot(query(collection(db, 'resource_bookings'), where('participantIds', 'array-contains', user.uid)), (snapshot) => {
      setBookings(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ResourceBookingRecord)));
    }, (error) => {
      console.error('Failed to load resource bookings:', error);
      setState('error');
    });

    return () => {
      unsubscribeListings();
      unsubscribeBookings();
    };
  }, [user.uid]);

  const visibleListings = useMemo(() => listings
    .filter((resource) => resource.status === 'active' || resource.ownerId === user.uid)
    .filter((resource) => !resource.visibilityRoles?.length || resource.visibilityRoles.includes(user.role) || resource.ownerId === user.uid), [listings, user.role, user.uid]);

  const selectedResource = visibleListings.find((resource) => resource.id === selectedResourceId) ?? visibleListings[0];

  useEffect(() => {
    if (!selectedResourceId && visibleListings[0]) {
      setSelectedResourceId(visibleListings[0].id);
    }
  }, [selectedResourceId, visibleListings]);

  const activeBookings = useMemo<ResourceBookingWindow[]>(() => bookings.map((booking) => ({
    id: booking.id,
    resourceId: booking.resourceId,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    status: booking.status,
  })), [bookings]);

  const requestBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedResource) return;
    setSaving(true);
    setFeedback(null);
    try {
      const request = { resourceId: selectedResource.id, startsAt: isoFromLocal(startsAt), endsAt: isoFromLocal(endsAt) };
      const audit = buildResourceBookingConflictAudit(request, activeBookings, new Date().toISOString());
      await addDoc(collection(db, 'resource_bookings'), {
        ...request,
        requesterId: user.uid,
        requesterName: user.displayName || user.email,
        ownerId: selectedResource.ownerId,
        participantIds: Array.from(new Set([user.uid, selectedResource.ownerId].filter(Boolean))),
        purpose: purpose.trim(),
        status: audit.canConfirm ? 'pending' : 'cancelled',
        audit,
        humanApprovalRequired: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setFeedback(audit.canConfirm ? 'Booking request recorded for owner confirmation.' : 'Requested window conflicts with an active booking and was recorded as cancelled for audit review.');
      setPurpose('');
    } catch (error) {
      console.error('Failed to request resource booking:', error);
      setFeedback(error instanceof Error ? error.message : 'Unable to request booking.');
    } finally {
      setSaving(false);
    }
  };

  const saveResource = async (event: FormEvent) => {
    event.preventDefault();
    if (!newResource.name.trim() || !newResource.capability.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      await addDoc(collection(db, 'resource_listings'), {
        ownerId: user.uid,
        ownerName: user.displayName || user.email,
        name: newResource.name.trim(),
        capability: newResource.capability.trim(),
        accessModel: newResource.accessModel.trim(),
        hourlyRateCents: Math.max(0, Math.round(Number(newResource.hourlyRate || 0) * 100)),
        currency: 'ZAR',
        platformFeeBps: 100,
        minimumBillableMinutes: 60,
        visibilityRoles: ['bep', 'architect', 'freelancer'],
        status: 'active',
        notes: newResource.notes.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setNewResource({ name: '', capability: '', accessModel: 'Remote desktop / supervised access', hourlyRate: '', notes: '' });
      setFeedback('Resource listing published for governed booking requests.');
    } catch (error) {
      console.error('Failed to publish resource listing:', error);
      setFeedback('Unable to publish resource listing.');
    } finally {
      setSaving(false);
    }
  };

  const updateBookingStatus = async (booking: ResourceBookingRecord, status: ResourceBookingStatus) => {
    await updateDoc(doc(db, 'resource_bookings', booking.id), { status, updatedAt: new Date().toISOString() });
    setFeedback(`Booking ${status}.`);
  };

  const logUsage = async (booking: ResourceBookingRecord) => {
    const resource = listings.find((listing) => listing.id === booking.resourceId);
    if (!resource) return;
    const policy: ResourceUsageBillingPolicy = {
      billingMode: 'hourly',
      hourlyRateCents: resource.hourlyRateCents ?? 0,
      minimumBillableMinutes: resource.minimumBillableMinutes ?? 60,
      platformFeeBps: resource.platformFeeBps ?? 1000,
      currency: resource.currency ?? 'ZAR',
    };
    const usage = {
      bookingId: booking.id,
      resourceId: booking.resourceId,
      userId: booking.requesterId,
      startedAt: booking.startsAt,
      endedAt: booking.endsAt,
      notes: 'Usage logged from resource sharing workspace for owner review.',
    };
    const ledgerEntry = buildResourceUsageLedgerEntry(`usage-${booking.id}-${Date.now()}`, usage, policy, new Date().toISOString());
    await addDoc(collection(db, 'resource_usage_logs'), {
      ...ledgerEntry,
      ownerId: resource.ownerId,
      participantIds: Array.from(new Set([booking.requesterId, resource.ownerId].filter(Boolean))),
      humanReviewRequired: true,
      createdAt: new Date().toISOString(),
    });
    await updateBookingStatus(booking, 'completed');
    setFeedback(`Usage logged for ${centsToCurrency(ledgerEntry.grossAmountCents, ledgerEntry.currency)} gross, pending payment governance.`);
  };

  const mine = bookings.filter((booking) => booking.requesterId === user.uid);
  const owned = bookings.filter((booking) => booking.ownerId === user.uid);

  return (
    <div className="space-y-6" data-testid="resource-sharing-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">Remote Desktop / Resources</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><HardDrive className="h-7 w-7 text-primary" /> Governed resource sharing</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live resource listings, conflict-checked booking requests, owner confirmation, and auditable usage logs. Payments and payouts remain in dedicated human-confirmed financial governance.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {state === 'loading' && <div className="md:col-span-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading resources...</div>}
          {state === 'error' && <div className="md:col-span-4 text-sm text-destructive">Unable to load resource records. Check Firestore access.</div>}
          <MetricCard icon={<HardDrive />} label="Visible resources" value={visibleListings.length} />
          <MetricCard icon={<Clock />} label="My requests" value={mine.length} />
          <MetricCard icon={<ShieldCheck />} label="Owner queue" value={owned.filter((booking) => booking.status === 'pending').length} />
          <MetricCard icon={<CheckCircle2 />} label="Completed" value={bookings.filter((booking) => booking.status === 'completed').length} />
        </CardContent>
      </Card>

      {feedback && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">{feedback}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Request a resource window</CardTitle><CardDescription>Conflict checks use the production resource booking service before records are persisted.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={requestBooking} className="space-y-4">
              <select value={selectedResource?.id ?? ''} onChange={(event) => setSelectedResourceId(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
                {visibleListings.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resource.capability}</option>)}
              </select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
                <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
              </div>
              <Textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Purpose, project/task reference, software needs, and expected deliverable" />
              <Button type="submit" disabled={!selectedResource || saving}>{saving ? 'Saving...' : 'Request booking'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Publish an owned resource</CardTitle><CardDescription>BEPs/freelancers can list governed workstations, software seats, rendering slots, or supervised tools.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={saveResource} className="space-y-4">
              <Input value={newResource.name} onChange={(event) => setNewResource((current) => ({ ...current, name: event.target.value }))} placeholder="Resource name" required />
              <Input value={newResource.capability} onChange={(event) => setNewResource((current) => ({ ...current, capability: event.target.value }))} placeholder="Capability, e.g. BIM authoring / rendering" required />
              <Input value={newResource.accessModel} onChange={(event) => setNewResource((current) => ({ ...current, accessModel: event.target.value }))} placeholder="Access model" />
              <Input type="number" min="0" step="0.01" value={newResource.hourlyRate} onChange={(event) => setNewResource((current) => ({ ...current, hourlyRate: event.target.value }))} placeholder="Hourly rate in ZAR" />
              <Textarea value={newResource.notes} onChange={(event) => setNewResource((current) => ({ ...current, notes: event.target.value }))} placeholder="Access notes, licence constraints, handover requirements" />
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Publish resource'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader><CardTitle className="font-heading text-xl">Available resources</CardTitle><CardDescription>No demo resources are generated. Records appear only from Firestore resource listings.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleListings.length === 0 ? <p className="md:col-span-2 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No active resources are visible for your role.</p> : visibleListings.map((resource) => (
            <div key={resource.id} className="rounded-xl border border-border p-4 text-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{resource.name}</p><p className="text-muted-foreground">{resource.capability}</p></div><Badge variant={resource.ownerId === user.uid ? 'default' : 'secondary'}>{resource.ownerId === user.uid ? 'Owned' : resource.status}</Badge></div>
              <p className="mt-3 text-xs text-muted-foreground">{resource.accessModel || 'Access model not recorded'} · {centsToCurrency(resource.hourlyRateCents, resource.currency)}/hour</p>
              {resource.notes && <p className="mt-2 text-xs text-muted-foreground">{resource.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader><CardTitle className="font-heading text-xl">Bookings and usage governance</CardTitle><CardDescription>Owners confirm requests; completed usage creates auditable billing records but never releases payment automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {bookings.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No booking records are visible yet.</p> : bookings.map((booking) => {
            const resource = listings.find((listing) => listing.id === booking.resourceId);
            return (
              <div key={booking.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div><p className="font-semibold">{resource?.name || booking.resourceId}</p><p className="mt-1 text-xs text-muted-foreground"><CalendarClock className="inline h-3 w-3 mr-1" />{new Date(booking.startsAt).toLocaleString()} to {new Date(booking.endsAt).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{booking.purpose || 'No purpose recorded'}</p></div>
                  <div className="flex flex-wrap items-center gap-2"><Badge>{booking.status}</Badge>{booking.ownerId === user.uid && booking.status === 'pending' && <Button size="sm" onClick={() => updateBookingStatus(booking, 'confirmed')}>Confirm</Button>}{booking.ownerId === user.uid && booking.status === 'confirmed' && <Button size="sm" variant="secondary" onClick={() => logUsage(booking)}><TimerReset className="h-4 w-4 mr-1" /> Log usage</Button>}{booking.ownerId === user.uid && booking.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => updateBookingStatus(booking, 'cancelled')}>Decline</Button>}</div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
