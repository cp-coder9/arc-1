import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Award, BookOpen, Calendar, GraduationCap, Loader2, TrendingUp, User } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type { CPDCourse, CPDRecord, CPDCertificate, CPDProfessionalBody, ArchitexBuiltEnvironmentRole } from '@/services/cpdTypes';
import { getProfessionalBodyRuleSet, getRoleBodyMapping } from '@/services/cpdIndex';
import { getAccreditationBadge, getCoursePricingLabel } from '@/services/cpdDisplayUtils';
import { Badge } from '@/components/ui/badge';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { StatCard } from '@/components/composite/StatCard';
import { GlassTable } from '@/components/composite/GlassTable';
import type { Column } from '@/components/composite/GlassTable';

type LoadState = 'loading' | 'ready' | 'error';

interface CPDHubProps {
  user: UserProfile;
  onNavigate?: (page: string) => void;
}

export default function CPDHub({ user, onNavigate }: CPDHubProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [courses, setCourses] = useState<CPDCourse[]>([]);
  const [records, setRecords] = useState<CPDRecord[]>([]);
  const [certificates, setCertificates] = useState<CPDCertificate[]>([]);

  const professionalBody: CPDProfessionalBody = (user.professionalBody as CPDProfessionalBody) || 'SACAP';
  const ruleSet = getProfessionalBodyRuleSet(professionalBody);
  const roleMapping = user.builtEnvironmentRole ? getRoleBodyMapping(user.builtEnvironmentRole as ArchitexBuiltEnvironmentRole) : null;

  const unitLabel = useMemo(() => {
    if (professionalBody === 'SACPLAN') return 'points';
    if (professionalBody === 'SACQSP') return 'hours';
    return 'credits';
  }, [professionalBody]);

  useEffect(() => {
    setState('loading');
    const unsubs: Array<() => void> = [];

    // Subscribe to live CPD courses
    const coursesQuery = query(collection(db, 'cpd_courses'), where('status', '==', 'live'), orderBy('title', 'asc'));
    const coursesUnsub = onSnapshot(coursesQuery, (snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDCourse)));
      setState('ready');
    }, (err) => { console.error('CPD courses load error:', err); setState('error'); });
    unsubs.push(coursesUnsub);

    // Subscribe to user's CPD records
    if (user.uid) {
      const recordsQuery = query(collection(db, `users/${user.uid}/cpd_records`), orderBy('issuedAt', 'desc'));
      const recordsUnsub = onSnapshot(recordsQuery, (snap) => {
        setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDRecord)));
      }, (err) => console.error('CPD records load error:', err));
      unsubs.push(recordsUnsub);

      const certsQuery = query(collection(db, 'cpd_certificates'), where('userId', '==', user.uid), orderBy('issueDate', 'desc'));
      const certsUnsub = onSnapshot(certsQuery, (snap) => {
        setCertificates(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDCertificate)));
      }, (err) => console.error('CPD certificates load error:', err));
      unsubs.push(certsUnsub);
    }

    return () => unsubs.forEach((u) => u());
  }, [user.uid]);

  const totalCredits = useMemo(() => records.reduce((sum, r) => sum + (r.creditsAwarded || 0), 0), [records]);
  const cycleProgress = ruleSet?.cycleTotalTargetCredits
    ? Math.round((totalCredits / ruleSet.cycleTotalTargetCredits) * 100)
    : null;
  const categoryOneCredits = useMemo(() => {
    const cat1Records = records.filter((r) => r.professionalBody === professionalBody);
    return cat1Records.reduce((sum, r) => sum + (r.creditsAwarded || 0), 0);
  }, [records, professionalBody]);

  const filteredCourses = useMemo(() =>
    courses.filter((c) => !c.professionalBodies || c.professionalBodies.includes(professionalBody)),
    [courses, professionalBody]
  );

  // Column definitions for GlassTable
  const courseColumns: Column<CPDCourse>[] = useMemo(() => [
    { key: 'title', label: 'Title', render: (_v, row) => <span className="font-semibold">{row.title}</span> },
    { key: 'providerName', label: 'Provider' },
    { key: 'approvedCredits', label: `Compliance ${unitLabel}`, render: (_v, row) => `${row.approvedCredits} ${unitLabel}` },
    {
      key: 'accreditationReference', label: 'Status', render: (_v, row) => {
        const badge = getAccreditationBadge(row);
        return <Badge variant={badge.variant as 'default' | 'secondary'} className="glass-pill">{badge.label}</Badge>;
      }
    },
    {
      key: 'assessmentPriceRand', label: 'Price', render: (_v, row) => {
        const pricing = getCoursePricingLabel(row);
        return (
          <Badge variant={pricing.price ? 'secondary' : 'outline'} className="glass-pill">
            {pricing.price || 'Partner Sponsored'}
          </Badge>
        );
      }
    },
  ], [unitLabel]);

  const recordColumns: Column<CPDRecord>[] = useMemo(() => [
    { key: 'courseId', label: 'Course' },
    { key: 'professionalBody', label: 'Body' },
    { key: 'creditsAwarded', label: `Compliance ${unitLabel}`, render: (_v, row) => `${row.creditsAwarded} ${unitLabel}` },
    { key: 'issuedAt', label: 'Issued' },
    { key: 'verificationCode', label: 'Verification', render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
  ], [unitLabel]);

  const certificateColumns: Column<CPDCertificate>[] = useMemo(() => [
    { key: 'courseTitle', label: 'Course', render: (_v, row) => <span className="font-semibold">{row.courseTitle}</span> },
    { key: 'professionalBody', label: 'Body' },
    { key: 'creditsAwarded', label: `Compliance ${unitLabel}`, render: (_v, row) => `${row.creditsAwarded} ${unitLabel}` },
    { key: 'issueDate', label: 'Issued' },
    { key: 'verificationCode', label: 'Code', render: (v) => <span className="font-mono text-xs">{String(v)}</span> },
  ], [unitLabel]);

  return (
    <div className="space-y-6" data-testid="cpd-hub">
      {/* Profile + summary header */}
      <DashboardSection
        title="Professional Compliance Learning"
        description={`Track your compliance ${unitLabel}, complete assessments, and manage your professional development records.`}
        icon={<GraduationCap className="h-5 w-5" />}
        action={<Badge className="capitalize w-fit">{user.role}</Badge>}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<User className="h-5 w-5" />} label="Professional Body" value={professionalBody} />
            <StatCard icon={<Award className="h-5 w-5" />} label={`Total Compliance ${unitLabel}`} value={totalCredits} />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Category 1" value={`${categoryOneCredits} ${unitLabel}`} />
            <StatCard icon={<Calendar className="h-5 w-5" />} label="Cycle" value={
              user.cpdCycleStart && user.cpdCycleEnd
                ? `${user.cpdCycleStart.slice(0, 4)}–${user.cpdCycleEnd.slice(0, 4)}`
                : ruleSet?.cycleYears ? `${ruleSet.cycleYears}-year` : '—'
            } />
          </div>

          {cycleProgress !== null && (
            <div>
              <div className="flex items-center justify-between text-sm text-foreground/60 mb-2">
                <span>Cycle progress</span>
                <span>{totalCredits} / {ruleSet?.cycleTotalTargetCredits} {unitLabel}</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(cycleProgress, 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </DashboardSection>

      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-foreground/60 p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading compliance hub...
        </div>
      )}
      {state === 'error' && (
        <div className="p-4 text-sm text-destructive">Unable to load compliance data. Check Firestore permissions.</div>
      )}

      {/* Available courses */}
      <DashboardSection
        title="Available Compliance Courses"
        description={`Accredited courses and assessments matching your professional body (${professionalBody}).`}
        icon={<BookOpen className="h-5 w-5" />}
      >
        <GlassTable<CPDCourse>
          columns={courseColumns}
          rows={filteredCourses}
          rowKey="id"
          onRowClick={(course) => onNavigate?.(`cpd-assessment:${course.id}`)}
          isLoading={state === 'loading'}
          emptyState={
            <p className="text-sm text-foreground/60">
              No live compliance courses are currently available. Check back soon or contact your administrator.
            </p>
          }
        />
      </DashboardSection>

      {/* Compliance Records */}
      <DashboardSection
        title="Compliance Records"
        description={`Your completed compliance activities and awarded ${unitLabel}.`}
        icon={<Award className="h-5 w-5" />}
      >
        <GlassTable<CPDRecord>
          columns={recordColumns}
          rows={records}
          rowKey="id"
          isLoading={state === 'loading'}
          emptyState={
            <p className="text-sm text-foreground/60">
              No compliance records yet. Complete a course assessment to earn {unitLabel}.
            </p>
          }
        />
      </DashboardSection>

      {/* Certificates */}
      <DashboardSection
        title="Certificates"
        description={`Issued compliance certificates available for download and verification.`}
        icon={<Award className="h-5 w-5" />}
      >
        <GlassTable<CPDCertificate>
          columns={certificateColumns}
          rows={certificates}
          rowKey="id"
          onRowClick={(cert) => onNavigate?.(`cpd-certificate:${cert.id}`)}
          isLoading={state === 'loading'}
          emptyState={
            <p className="text-sm text-foreground/60">
              No certificates issued yet. Certificates are automatically generated when you pass an accredited course assessment.
            </p>
          }
        />
      </DashboardSection>
    </div>
  );
}
