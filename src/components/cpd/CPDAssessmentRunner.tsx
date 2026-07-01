import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Award, BookOpen, CheckCircle2, Clock, Loader2, RotateCcw, Timer, XCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type { CPDCourse, CPDAssessmentDraft, CPDAttempt, CPDAnswerSubmission } from '@/services/cpdTypes';
import { scoreAttempt } from '@/services/cpdAccreditationWorkflowService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { StatCard } from '@/components/composite/StatCard';
import { getAccreditationBadge, getCoursePricingLabel } from '@/services/cpdDisplayUtils';
import { syncXACompletion } from '@/services/xaCompletionSyncService';

type LoadState = 'loading' | 'ready' | 'error';
type RunnerPhase = 'landing' | 'attempting' | 'submitted';

interface CPDAssessmentRunnerProps {
  user: UserProfile;
  courseId?: string;
  onCertificateView?: (certId: string) => void;
}

/**
 * Determines whether a course is XA-tagged by checking for a `tags` array
 * on the Firestore document or XA-related content in the title.
 */
function isXATaggedCourse(course: CPDCourse): boolean {
  const docData = course as unknown as Record<string, unknown>;
  if (Array.isArray(docData.tags)) {
    return (docData.tags as unknown[]).some(
      (tag) => typeof tag === 'string' && /XA|SANS.?10400.?XA/i.test(tag)
    );
  }
  return /SANS.?10400.?XA|XA\s+compliance|XA\s+energy/i.test(course.title);
}

export default function CPDAssessmentRunner({ user, courseId, onCertificateView }: CPDAssessmentRunnerProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [course, setCourse] = useState<CPDCourse | null>(null);
  const [assessment, setAssessment] = useState<CPDAssessmentDraft | null>(null);
  const [attempts, setAttempts] = useState<CPDAttempt[]>([]);
  const [phase, setPhase] = useState<RunnerPhase>('landing');
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [currentAttempt, setCurrentAttempt] = useState<CPDAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Load course and assessment data
  useEffect(() => {
    if (!courseId) {
      setState('ready');
      return;
    }

    setState('loading');
    const loadCourse = async () => {
      try {
        const courseSnap = await getDoc(doc(db, 'cpd_courses', courseId));
        if (!courseSnap.exists()) {
          setState('error');
          return;
        }
        const courseData = { id: courseSnap.id, ...courseSnap.data() } as CPDCourse;
        setCourse(courseData);

        // Load assessment
        const assessmentSnap = await getDoc(doc(db, 'cpd_assessment_drafts', courseData.assessmentId));
        if (assessmentSnap.exists()) {
          setAssessment({ id: assessmentSnap.id, ...assessmentSnap.data() } as CPDAssessmentDraft);
        }

        setState('ready');
      } catch (err) {
        console.error('Failed to load course:', err);
        setState('error');
      }
    };
    loadCourse();

    // Subscribe to user's attempts for this course
    if (user.uid && courseId) {
      const attemptsQuery = query(
        collection(db, `users/${user.uid}/cpd_attempts`),
        where('courseId', '==', courseId),
        orderBy('submittedAt', 'desc'),
      );
      const unsub = onSnapshot(attemptsQuery, (snap) => {
        setAttempts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDAttempt)));
      }, (err) => console.error('Attempts load error:', err));
      return () => unsub();
    }
  }, [user.uid, courseId]);

  // Timer
  useEffect(() => {
    if (phase !== 'attempting' || !assessment?.timeLimitMinutes || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const timer = setInterval(() => setSecondsLeft((s) => (s ?? 0) - 1), 1000);
    return () => clearInterval(timer);
  }, [phase, secondsLeft, assessment?.timeLimitMinutes]);

  const remainingAttempts = assessment ? Math.max(0, assessment.allowedAttempts - attempts.length) : 0;
  const latestAttempt = attempts[0] || null;

  const toggleAnswer = (questionId: string, optionId: string, multi: boolean) => {
    setAnswers((current) => {
      const existing = current[questionId] ?? [];
      if (!multi) return { ...current, [questionId]: [optionId] };
      return existing.includes(optionId)
        ? { ...current, [questionId]: existing.filter((id) => id !== optionId) }
        : { ...current, [questionId]: [...existing, optionId] };
    });
  };

  const startAttempt = () => {
    setAnswers({});
    setCurrentAttempt(null);
    setFeedback(null);
    setPhase('attempting');
    if (assessment?.timeLimitMinutes) {
      setSecondsLeft(assessment.timeLimitMinutes * 60);
    }
  };

  const handleSubmit = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!assessment || !course) return;
    setSaving(true);
    setFeedback(null);

    try {
      const submissions: CPDAnswerSubmission[] = assessment.questions.map((q) => ({
        questionId: q.id,
        selectedOptionIds: answers[q.id] || [],
      }));

      const attempt = scoreAttempt({
        assessment,
        course,
        userId: user.uid,
        answers: submissions,
        attemptNumber: attempts.length + 1,
      });

      // Save to Firestore
      await addDoc(collection(db, `users/${user.uid}/cpd_attempts`), {
        ...attempt,
        createdAt: new Date().toISOString(),
      });

      setCurrentAttempt(attempt);
      setPhase('submitted');

      if (attempt.passed) {
        setFeedback(`Congratulations! You passed with ${attempt.scorePercent}%. Check your certificates when the course is accredited.`);

        // Fire-and-forget XA completion sync for XA-tagged courses
        if (isXATaggedCourse(course)) {
          syncXACompletion(user.uid, course.id, course.title).catch((err) => {
            console.error('[XA Sync] Fire-and-forget sync failed:', err);
          });
        }
      } else {
        setFeedback(`Score: ${attempt.scorePercent}%. Pass mark is ${assessment.passMarkPercent}%. You have ${Math.max(0, remainingAttempts - 1)} attempts remaining.`);
      }
    } catch (err) {
      console.error('Failed to submit attempt:', err);
      setFeedback(err instanceof Error ? err.message : 'Unable to submit attempt.');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Derived display values
  const accreditationBadge = course ? getAccreditationBadge(course) : null;
  const pricingLabel = course ? getCoursePricingLabel(course) : null;

  if (!courseId) {
    return (
      <DashboardSection title="Professional Compliance Learning" icon={<BookOpen className="h-5 w-5" />}>
        <p className="text-center text-sm text-muted-foreground py-4">
          Select a compliance learning course to begin.
        </p>
      </DashboardSection>
    );
  }

  if (state === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading course...</div>;
  }
  if (state === 'error' || !course) {
    return <div className="p-4 text-sm text-destructive">Unable to load this compliance learning course.</div>;
  }

  return (
    <div className="space-y-6" data-testid="cpd-assessment-runner">
      {/* Course landing page */}
      {phase === 'landing' && (
        <DashboardSection
          title={course.title}
          description={course.providerName}
          icon={<BookOpen className="h-5 w-5" />}
          action={
            accreditationBadge && (
              <Badge variant={accreditationBadge.variant === 'default' ? 'default' : 'secondary'}>
                {accreditationBadge.label}
              </Badge>
            )
          }
        >
          <div className="space-y-4">
            {/* Pricing label */}
            {pricingLabel && (
              <div className="glass-pill inline-block px-3 py-1 rounded-full text-xs font-semibold">
                {pricingLabel.label}
              </div>
            )}

            {/* Metric tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Compliance Credits"
                value={course.approvedCredits}
                icon={<Award className="h-4 w-4" />}
              />
              <StatCard
                label="Accreditation"
                value={course.accreditationReference || 'Pending'}
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
              <StatCard
                label="Status"
                value={course.status}
                icon={<Clock className="h-4 w-4" />}
              />
            </div>

            {assessment && (
              <div className="glass-tile rounded-2xl p-4 space-y-2">
                <p className="font-semibold">Assessment Details</p>
                <p className="text-sm text-muted-foreground">{assessment.questions.length} questions · {assessment.passMarkPercent}% pass mark · {assessment.allowedAttempts} attempts allowed</p>
                {assessment.timeLimitMinutes && <p className="text-sm text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" /> {assessment.timeLimitMinutes} minute time limit</p>}
              </div>
            )}

            {latestAttempt && (
              <div className="glass-record rounded-2xl p-4">
                <p className="font-semibold flex items-center gap-2">
                  {latestAttempt.passed ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> : <XCircle className="h-4 w-4 text-destructive" />}
                  Previous Attempt: {latestAttempt.scorePercent}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">Submitted {latestAttempt.submittedAt}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              {course.status === 'live' && assessment && remainingAttempts > 0 && (
                <Button onClick={startAttempt} disabled={course.status !== 'live'}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {attempts.length === 0 ? 'Start Assessment' : 'Retry Assessment'} ({remainingAttempts} remaining)
                </Button>
              )}
              {remainingAttempts === 0 && (
                <p className="text-sm text-muted-foreground">Maximum attempts reached ({assessment?.allowedAttempts}).</p>
              )}
              {course.status !== 'live' && (
                <p className="text-sm text-muted-foreground">This course is not yet live. Assessment will be available once published.</p>
              )}
            </div>
          </div>
        </DashboardSection>
      )}

      {/* Assessment form */}
      {phase === 'attempting' && assessment && (
        <DashboardSection
          title={assessment.title}
          description={`${assessment.questions.length} questions · ${assessment.passMarkPercent}% to pass`}
          icon={<BookOpen className="h-5 w-5" />}
          action={
            secondsLeft !== null ? (
              <Badge variant={secondsLeft < 60 ? 'destructive' : 'secondary'} className="text-lg font-mono">
                <Clock className="h-4 w-4 mr-1" /> {formatTime(secondsLeft)}
              </Badge>
            ) : undefined
          }
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {assessment.questions.map((question, index) => {
              const selectedAnswers = answers[question.id] ?? [];
              const multi = question.type === 'multiple_select';
              return (
                <div key={question.id} className="glass-tile rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{index + 1}. {question.prompt}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {question.type.replace(/_/g, ' ')} · {question.points} point{question.points > 1 ? 's' : ''} · {question.difficulty}
                      </p>
                    </div>
                    <Badge variant="secondary">{selectedAnswers.length} selected</Badge>
                  </div>
                  {question.options.length === 0 ? (
                    <p className="mt-4 text-sm text-destructive">This question has no options and requires manual review.</p>
                  ) : (
                    <div className="mt-4 grid gap-2">
                      {question.options.map((option) => (
                        <label key={option.id} className="flex items-center gap-3 glass-record rounded-xl p-3 text-sm cursor-pointer hover:border-primary/30">
                          <input
                            type={multi ? 'checkbox' : 'radio'}
                            name={question.id}
                            checked={selectedAnswers.includes(option.id)}
                            onChange={() => toggleAnswer(question.id, option.id, multi)}
                            className="accent-primary"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : 'Submit Assessment'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPhase('landing')}>Cancel</Button>
            </div>
          </form>
        </DashboardSection>
      )}

      {/* Results */}
      {phase === 'submitted' && currentAttempt && (
        <DashboardSection
          title={currentAttempt.passed ? 'Assessment Passed!' : 'Assessment Not Passed'}
          description={`Score: ${currentAttempt.scorePercent}% (Pass mark: ${assessment?.passMarkPercent || 70}%)`}
          icon={currentAttempt.passed ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" /> : <XCircle className="h-5 w-5 text-destructive" />}
        >
          <div className="space-y-4">
            {/* Result icon */}
            <div className="text-center py-4">
              {currentAttempt.passed ? (
                <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400 mx-auto" />
              ) : (
                <XCircle className="h-16 w-16 text-destructive mx-auto" />
              )}
            </div>

            {feedback && (
              <div className={`glass-tile rounded-2xl p-4 text-sm ${currentAttempt.passed ? 'border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' : 'border border-destructive/20 text-destructive'}`}>
                {feedback}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Score" value={`${currentAttempt.scorePercent}%`} />
              <StatCard
                label="Result"
                value={currentAttempt.passed ? 'Passed' : 'Failed'}
              />
              <StatCard
                label="Attempt"
                value={`${currentAttempt.attemptNumber} / ${assessment?.allowedAttempts || '—'}`}
              />
              <StatCard
                label="Manual Review"
                value={currentAttempt.manualReviewRequired ? 'Required' : 'None'}
              />
            </div>

            <div className="flex items-center gap-3">
              {currentAttempt.passed && !currentAttempt.manualReviewRequired && currentAttempt.certificateId && (
                <Button onClick={() => onCertificateView?.(currentAttempt.certificateId!)}>
                  <Award className="h-4 w-4 mr-2" /> View Certificate
                </Button>
              )}
              {!currentAttempt.passed && remainingAttempts > 1 && (
                <Button onClick={startAttempt}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Retry ({remainingAttempts - 1} left)
                </Button>
              )}
              <Button variant="outline" onClick={() => setPhase('landing')}>Back to Course</Button>
            </div>
          </div>
        </DashboardSection>
      )}
    </div>
  );
}
