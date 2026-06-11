import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Award, BookOpen, Calendar, Clock, GraduationCap, Loader2, TrendingUp, User } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type { CPDCourse, CPDRecord, CPDCertificate, CPDProfessionalBody, ArchitexBuiltEnvironmentRole } from '@/services/cpdTypes';
import { getProfessionalBodyRuleSet, getRoleBodyMapping, calculateCPDCredits } from '@/services/cpdIndex';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    // In production, filter records by category; use total as proxy for MVP
    const cat1Records = records.filter((r) => r.professionalBody === professionalBody);
    return cat1Records.reduce((sum, r) => sum + (r.creditsAwarded || 0), 0);
  }, [records, professionalBody]);

  return (
    <div className="space-y-6" data-testid="cpd-hub">
      {/* Profile + summary header */}
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">CPD Hub</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3">
                <GraduationCap className="h-7 w-7 text-primary" />
                Professional Development
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Track your CPD {unitLabel}, complete assessments, and manage your professional development records.
              </CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard icon={<User />} label="Professional Body" value={professionalBody} />
          <MetricCard icon={<Award />} label={`Total ${unitLabel}`} value={totalCredits} />
          <MetricCard icon={<TrendingUp />} label="Category 1" value={`${categoryOneCredits} ${unitLabel}`} />
          <MetricCard icon={<Calendar />} label="Cycle" value={
            user.cpdCycleStart && user.cpdCycleEnd
              ? `${user.cpdCycleStart.slice(0, 4)}–${user.cpdCycleEnd.slice(0, 4)}`
              : ruleSet?.cycleYears ? `${ruleSet.cycleYears}-year` : '—'
          } />
        </CardContent>
        {cycleProgress !== null && (
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>Cycle progress</span>
              <span>{totalCredits} / {ruleSet?.cycleTotalTargetCredits} {unitLabel}</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(cycleProgress, 100)}%` }} />
            </div>
          </div>
        )}
      </Card>

      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading CPD hub...
        </div>
      )}
      {state === 'error' && (
        <div className="p-4 text-sm text-destructive">Unable to load CPD data. Check Firestore permissions.</div>
      )}

      {/* Available courses */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Available CPD Courses
          </CardTitle>
          <CardDescription>
            Accredited courses and assessments matching your professional body ({professionalBody}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {courses.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No live CPD courses are currently available. Check back soon or contact your administrator.
            </p>
          ) : (
            courses.filter((c) => !c.professionalBodies || c.professionalBodies.includes(professionalBody)).map((course) => (
              <div key={course.id} className="rounded-xl border border-border p-4 text-sm hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{course.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {course.providerName} · {course.approvedCredits} approved {unitLabel}
                      {course.accreditationReference && ` · Ref: ${course.accreditationReference}`}
                    </p>
                    {course.validUntil && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" /> Valid until {course.validUntil}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {course.assessmentPriceRand && course.assessmentPriceRand > 0 ? (
                      <Badge variant="secondary">R {course.assessmentPriceRand}</Badge>
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                    <Button size="sm" variant="default" onClick={() => onNavigate?.(`cpd-assessment:${course.id}`)}>
                      View Course
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* CPD Records */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" /> CPD Records
          </CardTitle>
          <CardDescription>Your completed CPD activities and awarded {unitLabel}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {records.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No CPD records yet. Complete a course assessment to earn {unitLabel}.
            </p>
          ) : (
            records.map((record) => (
              <div key={record.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{record.courseId}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {record.professionalBody} · {record.creditsAwarded} {unitLabel} · Issued {record.issuedAt}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      Verification: {record.verificationCode}
                    </p>
                  </div>
                  <Badge variant="default">Complete</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Certificates */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Certificates</CardTitle>
          <CardDescription>Issued CPD certificates available for download and verification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {certificates.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No certificates issued yet. Certificates are automatically generated when you pass an accredited course assessment.
            </p>
          ) : (
            certificates.map((cert) => (
              <div key={cert.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{cert.courseTitle}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {cert.professionalBody} · {cert.creditsAwarded} {unitLabel} · Issued {cert.issueDate}
                    </p>
                    {cert.accreditationReference && (
                      <p className="text-xs text-muted-foreground">Accreditation: {cert.accreditationReference}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      Code: {cert.verificationCode}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Badge variant="default">Issued</Badge>
                    <Button size="sm" variant="outline" onClick={() => onNavigate?.(`cpd-certificate:${cert.id}`)}>
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">
        {icon}
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 font-heading text-3xl font-black">{value}</p>
    </div>
  );
}
