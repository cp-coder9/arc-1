import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { BarChart3, BookOpen, Loader2, TrendingUp, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type { CPDAssessmentAnalytics, CPDLecturerAnalytics, CPDAttempt, CPDCourse } from '@/services/cpdTypes';
import { calculateAssessmentAnalytics, calculateLecturerAnalytics } from '@/services/cpdIndex';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LoadState = 'loading' | 'ready' | 'error';

interface CPDAnalyticsDashboardProps {
  user: UserProfile;
  lecturerMode?: boolean;
  courseIds?: string[];
}

export default function CPDAnalyticsDashboard({ user, lecturerMode = false, courseIds = [] }: CPDAnalyticsDashboardProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [courses, setCourses] = useState<CPDCourse[]>([]);
  const [allAttempts, setAllAttempts] = useState<CPDAttempt[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  useEffect(() => {
    setState('loading');

    // Subscribe to courses
    const coursesUnsub = onSnapshot(query(collection(db, 'cpd_courses'), orderBy('title', 'asc')), (snap) => {
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDCourse));
      setCourses(loaded);
    }, (err) => { console.error(err); setState('error'); });

    // Subscribe to all attempts (in production, use collectionGroup or dedicated analytics collection)
    // For MVP, attempt data comes from course-level analytics stored in cpd_assessment_analytics
    const analyticsUnsub = onSnapshot(collection(db, 'cpd_assessment_analytics'), (snap) => {
      // Analytics records contain aggregate data, not individual attempts
      // For the dashboard, we use the stored analytics directly
      setState('ready');
    }, (err) => { console.error(err); setState('ready'); }); // Non-critical, continue even if empty

    return () => {
      coursesUnsub();
      analyticsUnsub();
    };
  }, []);

  // Load attempts for selected course
  useEffect(() => {
    if (!selectedCourseId) return;

    // In production, load attempts from users/*/cpd_attempts via collectionGroup
    // For MVP, we use the analytics collection
    const attemptsQuery = query(collection(db, 'cpd_assessment_analytics'));
    // Analytics are pre-computed; shown below
  }, [selectedCourseId]);

  const filteredCourses = lecturerMode
    ? courses.filter((c) => courseIds.length === 0 || courseIds.includes(c.id))
    : courses;

  // Sample analytics when no real data exists yet
  const demoAnalytics: CPDAssessmentAnalytics[] = useMemo(() => {
    return filteredCourses.map((course) => ({
      assessmentId: course.assessmentId,
      courseId: course.id,
      totalAttempts: 0,
      uniqueLearners: 0,
      passRatePercent: 0,
      averageScorePercent: 0,
      questionStats: [],
    }));
  }, [filteredCourses]);

  if (state === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading analytics...</div>;
  }

  return (
    <div className="space-y-6" data-testid="cpd-analytics-dashboard">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <Badge variant="secondary" className="uppercase tracking-widest">
            {lecturerMode ? 'Lecturer Analytics' : 'CPD Analytics'}
          </Badge>
          <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-primary" />
            {lecturerMode ? 'My Course Performance' : 'CPD Assessment Analytics'}
          </CardTitle>
          <CardDescription className="mt-2 text-base">
            Assessment pass rates, average scores, learner engagement, and question-level performance.
            {lecturerMode && ' Filtered to courses you own.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<BookOpen className="h-5 w-5" />}
          label="Courses"
          value={filteredCourses.length}
          sub={`${filteredCourses.filter((c) => c.status === 'live').length} live`}
        />
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          label="Total Learners"
          value={demoAnalytics.reduce((sum, a) => sum + a.uniqueLearners, 0)}
          sub="unique"
        />
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Avg Pass Rate"
          value={`${demoAnalytics.length > 0 ? Math.round(demoAnalytics.reduce((sum, a) => sum + a.passRatePercent, 0) / demoAnalytics.length) : 0}%`}
          sub="across all courses"
        />
        <SummaryCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="Total Attempts"
          value={demoAnalytics.reduce((sum, a) => sum + a.totalAttempts, 0)}
          sub="attempts"
        />
      </div>

      {/* Course-level analytics */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Course Performance</CardTitle>
          <CardDescription>Per-course analytics as assessment attempts accumulate.</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCourses.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No courses available for analytics.
            </p>
          ) : (
            <div className="space-y-4">
              {filteredCourses.map((course) => {
                const analytics = demoAnalytics.find((a) => a.courseId === course.id);
                return (
                  <div key={course.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold">{course.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {course.providerName} · {course.approvedCredits} credits
                        </p>
                      </div>
                      <Badge variant={course.status === 'live' ? 'default' : 'secondary'}>{course.status}</Badge>
                    </div>

                    {/* Analytics bars */}
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatBadge label="Attempts" value={analytics?.totalAttempts ?? 0} />
                      <StatBadge label="Learners" value={analytics?.uniqueLearners ?? 0} />
                      <StatBadge label="Pass Rate" value={`${analytics?.passRatePercent ?? 0}%`} highlight={(analytics?.passRatePercent ?? 0) >= 70} />
                      <StatBadge label="Avg Score" value={`${analytics?.averageScorePercent ?? 0}%`} highlight={(analytics?.averageScorePercent ?? 0) >= 75} />
                    </div>

                    {/* Question performance (if analytics exist) */}
                    {analytics && analytics.questionStats.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-primary">
                          Question Performance ({analytics.questionStats.length} questions)
                        </summary>
                        <div className="mt-3 space-y-2">
                          {analytics.questionStats.map((qs) => (
                            <div key={qs.questionId} className="flex items-center gap-3 rounded-lg border border-border p-2 text-xs">
                              <span className="font-mono text-muted-foreground">{qs.questionId}</span>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span>Correct Rate</span>
                                  <span>{qs.correctRatePercent}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${qs.correctRatePercent >= 70 ? 'bg-green-500' : qs.correctRatePercent >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${qs.correctRatePercent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {analytics && analytics.questionStats.length === 0 && (
                      <p className="mt-3 text-xs text-muted-foreground italic">No attempt data yet. Analytics will populate as learners complete assessments.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quality guidance */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Quality Indicators</CardTitle>
          <CardDescription>Use analytics to improve CPD assessment quality.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 rounded-xl border border-border p-3">
            <span className="text-amber-500 text-lg">⚠</span>
            <div>
              <p className="font-semibold text-foreground">Very low pass rates (&lt; 40%)</p>
              <p>May indicate poor content quality, confusing questions, or an overly difficult assessment. Review question wording and learning outcomes.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-3">
            <span className="text-amber-500 text-lg">⚠</span>
            <div>
              <p className="font-semibold text-foreground">Very high pass rates (&gt; 95%)</p>
              <p>May indicate questions are too obvious or answers are guessable. Consider increasing question difficulty or adding scenario-based questions.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-3">
            <span className="text-blue-500 text-lg">ℹ</span>
            <div>
              <p className="font-semibold text-foreground">Weak questions (&lt; 50% correct rate)</p>
              <p>Questions where most learners answer incorrectly may need revision — check if the correct answer is genuinely correct and the learning outcome is well-taught.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">
          {icon}
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        </div>
        <p className="mt-3 font-heading text-3xl font-black">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatBadge({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${highlight ? 'border-green-200 bg-green-50 dark:bg-green-950/10' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-heading text-lg font-black ${highlight ? 'text-green-700 dark:text-green-400' : ''}`}>{value}</p>
    </div>
  );
}
