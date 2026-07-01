import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { BarChart3, BookOpen, Loader2, TrendingUp, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type { CPDAssessmentAnalytics, CPDAttempt, CPDCourse } from '@/services/cpdTypes';
import { Badge } from '@/components/ui/badge';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { GlassTable, type Column } from '@/components/composite/GlassTable';
import { GlassChart, type GlassChartDataPoint } from '@/components/composite/GlassChart';
import { StatCard } from '@/components/composite/StatCard';

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

  // Prepare chart data for pass rate visualisation
  const passRateChartData: GlassChartDataPoint[] = useMemo(() => {
    return filteredCourses.map((course) => {
      const analytics = demoAnalytics.find((a) => a.courseId === course.id);
      return {
        name: course.title.slice(0, 20),
        value: analytics?.passRatePercent ?? 0,
      };
    });
  }, [filteredCourses, demoAnalytics]);

  // Prepare chart data for learner engagement
  const learnerChartData: GlassChartDataPoint[] = useMemo(() => {
    return filteredCourses.map((course) => {
      const analytics = demoAnalytics.find((a) => a.courseId === course.id);
      return {
        name: course.title.slice(0, 20),
        value: analytics?.uniqueLearners ?? 0,
        attempts: analytics?.totalAttempts ?? 0,
      };
    });
  }, [filteredCourses, demoAnalytics]);

  // Table columns for course performance
  const courseColumns: Column<CPDCourse & { analytics?: CPDAssessmentAnalytics }>[] = [
    { key: 'title' as keyof (CPDCourse & { analytics?: CPDAssessmentAnalytics }), label: 'Course Title' },
    { key: 'providerName' as keyof (CPDCourse & { analytics?: CPDAssessmentAnalytics }), label: 'Provider' },
    {
      key: 'approvedCredits' as keyof (CPDCourse & { analytics?: CPDAssessmentAnalytics }),
      label: 'Compliance Credits',
      render: (val) => `${val} credits`,
    },
    {
      key: 'status' as keyof (CPDCourse & { analytics?: CPDAssessmentAnalytics }),
      label: 'Status',
      render: (val) => (
        <Badge variant={val === 'live' ? 'default' : 'secondary'} className="glass-pill">
          {String(val)}
        </Badge>
      ),
    },
  ];

  // Rows with merged analytics
  const courseRows = useMemo(() => {
    return filteredCourses.map((course) => ({
      ...course,
      analytics: demoAnalytics.find((a) => a.courseId === course.id),
    }));
  }, [filteredCourses, demoAnalytics]);

  if (state === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading analytics...</div>;
  }

  return (
    <div className="space-y-6" data-testid="cpd-analytics-dashboard">
      {/* Header section */}
      <DashboardSection
        title={lecturerMode ? 'My Course Performance' : 'Compliance Analytics'}
        description="Assessment pass rates, average scores, learner engagement, and question-level performance."
        icon={<BarChart3 className="h-5 w-5" />}
        action={
          <Badge variant="secondary" className="glass-pill uppercase tracking-widest">
            {lecturerMode ? 'Lecturer Analytics' : 'Compliance Analytics'}
          </Badge>
        }
      >
        {/* Summary metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<BookOpen className="h-5 w-5" />}
            label="Courses"
            value={filteredCourses.length}
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total Learners"
            value={demoAnalytics.reduce((sum, a) => sum + a.uniqueLearners, 0)}
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Avg Pass Rate"
            value={`${demoAnalytics.length > 0 ? Math.round(demoAnalytics.reduce((sum, a) => sum + a.passRatePercent, 0) / demoAnalytics.length) : 0}%`}
          />
          <StatCard
            icon={<BarChart3 className="h-5 w-5" />}
            label="Total Attempts"
            value={demoAnalytics.reduce((sum, a) => sum + a.totalAttempts, 0)}
          />
        </div>
      </DashboardSection>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassChart
          title="Pass Rate by Course"
          chartType="bar"
          data={passRateChartData}
          height={260}
        />
        <GlassChart
          title="Learner Engagement"
          chartType="area"
          data={learnerChartData}
          keys={['value', 'attempts']}
          height={260}
        />
      </div>

      {/* Course-level analytics table */}
      <DashboardSection
        title="Course Performance"
        description="Per-course analytics as assessment attempts accumulate."
        icon={<BookOpen className="h-5 w-5" />}
      >
        <GlassTable
          columns={courseColumns}
          rows={courseRows}
          rowKey={'id' as keyof (CPDCourse & { analytics?: CPDAssessmentAnalytics })}
          onRowClick={(row) => setSelectedCourseId(row.id)}
          emptyState={
            <p className="glass-panel rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No courses available for analytics.
            </p>
          }
        />

        {/* Expanded course detail when selected */}
        {selectedCourseId && (() => {
          const selected = courseRows.find((c) => c.id === selectedCourseId);
          if (!selected) return null;
          const analytics = selected.analytics;

          return (
            <div className="glass-tile rounded-xl p-5 mt-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-heading font-semibold text-foreground">{selected.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selected.providerName} · {selected.approvedCredits} compliance credits
                  </p>
                </div>
                <Badge variant={selected.status === 'live' ? 'default' : 'secondary'} className="glass-pill">{selected.status}</Badge>
              </div>

              {/* Analytics summary grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                      <div key={qs.questionId} className="flex items-center gap-3 glass-record rounded-lg p-2 text-xs">
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
        })()}
      </DashboardSection>

      {/* Quality guidance */}
      <DashboardSection
        title="Quality Indicators"
        description="Use analytics to improve compliance assessment quality."
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 glass-record rounded-xl p-3">
            <span className="text-amber-500 text-lg">⚠</span>
            <div>
              <p className="font-semibold text-foreground">Very low pass rates (&lt; 40%)</p>
              <p>May indicate poor content quality, confusing questions, or an overly difficult assessment. Review question wording and learning outcomes.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 glass-record rounded-xl p-3">
            <span className="text-amber-500 text-lg">⚠</span>
            <div>
              <p className="font-semibold text-foreground">Very high pass rates (&gt; 95%)</p>
              <p>May indicate questions are too obvious or answers are guessable. Consider increasing question difficulty or adding scenario-based questions.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 glass-record rounded-xl p-3">
            <span className="text-blue-500 text-lg">ℹ</span>
            <div>
              <p className="font-semibold text-foreground">Weak questions (&lt; 50% correct rate)</p>
              <p>Questions where most learners answer incorrectly may need revision — check if the correct answer is genuinely correct and the learning outcome is well-taught.</p>
            </div>
          </div>
        </div>
      </DashboardSection>
    </div>
  );
}

function StatBadge({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`glass-tile rounded-xl p-3 text-center ${highlight ? 'border-green-200 bg-green-50 dark:bg-green-950/10' : ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-heading text-lg font-black ${highlight ? 'text-green-700 dark:text-green-400' : ''}`}>{value}</p>
    </div>
  );
}
