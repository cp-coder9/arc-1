import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Award, BookOpen, CheckCircle2, Clock, Loader2, RotateCcw, Timer, XCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type { CPDCourse, CPDAssessmentDraft, CPDAttempt, CPDAnswerSubmission } from '@/services/cpdTypes';
import { scoreAttempt } from '@/services/cpdAccreditationWorkflowService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LoadState = 'loading' | 'ready' | 'error';
type RunnerPhase = 'landing' | 'attempting' | 'submitted';

interface CPDAssessmentRunnerProps {
  user: UserProfile;
  courseId?: string;
  onCertificateView?: (certId: string) => void;
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
        console.error('Failed to load CPD course:', err);
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

  if (!courseId) {
    return (
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Select a CPD course to begin.
        </CardContent>
      </Card>
    );
  }

  if (state === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading course...</div>;
  }
  if (state === 'error' || !course) {
    return <div className="p-4 text-sm text-destructive">Unable to load this CPD course.</div>;
  }

  return (
    <div className="space-y-6" data-testid="cpd-assessment-runner">
      {/* Course landing page */}
      {phase === 'landing' && (
        <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-border">
            <Badge variant="secondary" className="uppercase tracking-widest">CPD Course</Badge>
            <CardTitle className="font-heading text-3xl mt-3">{course.title}</CardTitle>
            <CardDescription className="mt-2 text-base">{course.providerName}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Credits</p>
                <p className="font-heading text-2xl font-black mt-1">{course.approvedCredits}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Accreditation</p>
                <p className="font-heading text-lg font-semibold mt-1">{course.accreditationReference || 'Pending'}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Status</p>
                <Badge className="mt-1">{course.status}</Badge>
              </div>
            </div>

            {assessment && (
              <div className="rounded-2xl border border-border p-4 space-y-2">
                <p className="font-semibold">Assessment Details</p>
                <p className="text-sm text-muted-foreground">{assessment.questions.length} questions · {assessment.passMarkPercent}% pass mark · {assessment.allowedAttempts} attempts allowed</p>
                {assessment.timeLimitMinutes && <p className="text-sm text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" /> {assessment.timeLimitMinutes} minute time limit</p>}
              </div>
            )}

            {latestAttempt && (
              <div className="rounded-2xl border border-border p-4">
                <p className="font-semibold flex items-center gap-2">
                  {latestAttempt.passed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
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
          </CardContent>
        </Card>
      )}

      {/* Assessment form */}
      {phase === 'attempting' && assessment && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading text-xl">{assessment.title}</CardTitle>
                <CardDescription>{assessment.questions.length} questions · {assessment.passMarkPercent}% to pass</CardDescription>
              </div>
              {secondsLeft !== null && (
                <Badge variant={secondsLeft < 60 ? 'destructive' : 'secondary'} className="text-lg font-mono">
                  <Clock className="h-4 w-4 mr-1" /> {formatTime(secondsLeft)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {assessment.questions.map((question, index) => {
                const selectedAnswers = answers[question.id] ?? [];
                const multi = question.type === 'multiple_select';
                return (
                  <div key={question.id} className="rounded-2xl border border-border p-4">
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
                          <label key={option.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3 text-sm cursor-pointer hover:border-primary/30">
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
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {phase === 'submitted' && currentAttempt && (
        <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
          <CardHeader className={`border-b border-border ${currentAttempt.passed ? 'bg-green-50 dark:bg-green-950/20' : 'bg-destructive/5'}`}>
            <div className="text-center">
              {currentAttempt.passed ? (
                <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-3" />
              ) : (
                <XCircle className="h-16 w-16 text-destructive mx-auto mb-3" />
              )}
              <CardTitle className="font-heading text-3xl">
                {currentAttempt.passed ? 'Assessment Passed!' : 'Assessment Not Passed'}
              </CardTitle>
              <CardDescription className="mt-2 text-lg">
                Score: {currentAttempt.scorePercent}% (Pass mark: {assessment?.passMarkPercent || 70}%)
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {feedback && (
              <div className={`rounded-2xl p-4 text-sm ${currentAttempt.passed ? 'border border-green-200 bg-green-50 dark:bg-green-950/10 text-green-800 dark:text-green-200' : 'border border-destructive/20 bg-destructive/5 text-destructive'}`}>
                {feedback}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="font-heading text-xl font-black">{currentAttempt.scorePercent}%</p>
              </div>
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Result</p>
                <Badge variant={currentAttempt.passed ? 'default' : 'destructive'}>{currentAttempt.passed ? 'Passed' : 'Failed'}</Badge>
              </div>
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Attempt</p>
                <p className="font-heading text-xl font-black">{currentAttempt.attemptNumber} / {assessment?.allowedAttempts || '—'}</p>
              </div>
              <div className="rounded-xl border border-border p-3 text-center">
                <p className="text-xs text-muted-foreground">Manual Review</p>
                <Badge variant={currentAttempt.manualReviewRequired ? 'secondary' : 'outline'}>
                  {currentAttempt.manualReviewRequired ? 'Required' : 'None'}
                </Badge>
              </div>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
