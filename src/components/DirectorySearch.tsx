import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Search, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import type { UserProfile, UserRole } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
type DirectoryProfile = {
  uid: string;
  role: UserRole | string;
  displayName?: string;
  region?: string;
  discipline?: string;
  verificationStatus?: string;
  visible?: boolean;
  updatedAt?: string;
};

const targetRoles = ['bep', 'architect', 'contractor', 'subcontractor', 'supplier', 'freelancer'];
const DIRECTORY_RESULT_WINDOW = 36;

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function sortProfiles(profiles: DirectoryProfile[]) {
  return [...profiles].sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt));
}

export default function DirectorySearch({ user }: { user: UserProfile }) {
  const [profiles, setProfiles] = useState<DirectoryProfile[]>([]);
  const [role, setRole] = useState('all');
  const [term, setTerm] = useState('');
  const [region, setRegion] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(DIRECTORY_RESULT_WINDOW);

  useEffect(() => {
    const constraints = role === 'all'
      ? [where('visible', '==', true), limit(100)]
      : [where('visible', '==', true), where('role', '==', role), limit(100)];
    const unsub = onSnapshot(query(getDemoCol( 'directoryProfiles'), ...constraints), (snapshot) => {
      setProfiles(sortProfiles(snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() } as DirectoryProfile))));
    }, (error) => {
      console.error('Failed to load directory profiles:', error);
      toast.error('Failed to load directory profiles. Check Firestore indexes/rules.');
    });
    return () => unsub();
  }, [role]);

  const filteredProfiles = useMemo(() => profiles.filter((profile) => {
    const haystack = [profile.displayName, profile.role, profile.discipline, profile.region, profile.verificationStatus].join(' ').toLowerCase();
    return (!term || haystack.includes(term.toLowerCase())) && (!region || (profile.region || '').toLowerCase().includes(region.toLowerCase()));
  }), [profiles, region, term]);

  useEffect(() => {
    setVisibleCount(DIRECTORY_RESULT_WINDOW);
  }, [region, role, term]);

  const visibleProfiles = useMemo(() => filteredProfiles.slice(0, visibleCount), [filteredProfiles, visibleCount]);
  const hiddenResultCount = Math.max(filteredProfiles.length - visibleProfiles.length, 0);

  const invite = async (profile: DirectoryProfile) => {
    setInviting(profile.uid);
    try {
      await addDoc(getDemoCol( 'directoryInvitations'), {
        fromUserId: user.uid,
        fromRole: user.role,
        targetUserId: profile.uid,
        targetRole: profile.role,
        targetDisplayName: profile.displayName || '',
        invitationType: invitationTypeFor(user.role, String(profile.role)),
        status: 'pending',
        humanReviewRequired: true,
        createdAt: new Date().toISOString(),
      });
      toast.success('Invitation request recorded for follow-up.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record invitation.');
    } finally {
      setInviting(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="directory-search">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <Badge variant="secondary" className="w-fit uppercase tracking-widest">Client Tools</Badge>
          <CardTitle className="font-heading text-3xl flex items-center gap-3"><Search className="text-primary" /> Directory Search</CardTitle>
          <CardDescription>Search real directory profile projections by role, discipline/trade, region, and verification status. Invitations are recorded for human follow-up and do not auto-appoint users.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Name, firm, discipline, registration..." value={term} onChange={(event) => setTerm(event.target.value)} />
            <Input placeholder="Region" value={region} onChange={(event) => setRegion(event.target.value)} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">All roles</option>
              {targetRoles.map((roleOption) => <option key={roleOption} value={roleOption}>{roleOption}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{filteredProfiles.length} visible profile{filteredProfiles.length === 1 ? '' : 's'} match the current filters.</p>
        {hiddenResultCount > 0 && <p>Showing {visibleProfiles.length}; load more to keep large directories responsive.</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {visibleProfiles.map((profile) => (
          <Card key={profile.uid} className="rounded-2xl border-border bg-card/90">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="secondary" className="mb-3 capitalize">{profile.role}</Badge>
                  <CardTitle className="font-heading text-xl">{profile.displayName || 'Unnamed profile'}</CardTitle>
                  <CardDescription>{profile.discipline || 'Discipline/trade not recorded'} · {profile.region || 'Region not recorded'}</CardDescription>
                </div>
                <Badge variant={profile.verificationStatus === 'verified' ? 'default' : 'outline'} className="gap-1"><ShieldCheck className="h-3 w-3" />{profile.verificationStatus || 'pending'}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full rounded-xl" disabled={inviting === profile.uid} onClick={() => invite(profile)}><Send className="h-4 w-4 mr-2" /> Invite / request fit check</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {hiddenResultCount > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" className="rounded-xl" onClick={() => setVisibleCount((current) => current + DIRECTORY_RESULT_WINDOW)}>
            Load {Math.min(DIRECTORY_RESULT_WINDOW, hiddenResultCount)} more profiles
          </Button>
        </div>
      )}

      {filteredProfiles.length === 0 && <Card className="rounded-2xl"><CardContent className="p-10 text-center text-sm text-muted-foreground">No visible directory profiles match the current filters.</CardContent></Card>}
    </div>
  );
}

function invitationTypeFor(fromRole: string, targetRole: string) {
  if (fromRole === 'client') return targetRole === 'contractor' ? 'tender_invite' : 'proposal_invite';
  if (fromRole === 'contractor') return targetRole === 'supplier' ? 'supplier_quote' : 'package_invite';
  return 'team_invite';
}
