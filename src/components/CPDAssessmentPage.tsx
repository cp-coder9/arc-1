import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Award, BookOpen, CheckCircle2, ClipboardCheck, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { scoreCPDAttempt, type CPDAssessment, type CPDAttemptResult } from '@/services/cpdScoring';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type LoadState = 'loading' | 'ready' | 'error';
type CPDAttemptRecord = CPDAttemptResult & { id: string; courseId?: string; createdAt?: string; certificatePending?: boolean };

function optionsForQuestion(question: CPDAssessment['questions'][number]) {
  if (question.options?.length) return question.options;
  if (question.type === 'true_false') return [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }];
  return [];
}

export default function CPDAssessmentPage({ user }: { user: UserProfile }) {
  const [state, setState] = useState<LoadState>('loading');
  const [assessments, setAssessments] = useState<CPDAssessment[]>([]);
  const [attempts, setAttempts] = useState<CPDAttemptRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setState('loading');
    const assessmentsUnsub = onSnapshot(query(collection(db, 'cpd_assessments'), orderBy('courseId', 'asc')), (snapshot) => {
      setAssessments(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as CPDAssessment)));
      setState('ready');
    }, (error) => {
      console.error('Failed to load CPD assessments:', error);
      setState('error');
    });
    const attemptsUnsub = onSnapshot(query(collection(db, 'cpd_attempts'), where('userId', '==', user.uid)), (snapshot) => {
      setAttempts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as CPDAttemptRecord)));
    }, (error) => {
      console.error('Failed to load CPD attempts:', error);
      setState('error');
    });
    return () => {
      assessmentsUnsub();
      attemptsUnsub();
    };
  }, [user.uid]);

  useEffect(() => {
    if (!selectedId && assessments[0]) setSelectedId(assessments[0].id);
  }, [assessments, selectedId]);

  const selectedAssessment = assessments.find((assessment) => assessment.id === selectedId) ?? assessments[0];
  const latestAttemptByAssessment = useMemo(() => {
    const map = new Map<string, CPDAttemptRecord>();
    for (const attempt of attempts) {
      const current = map.get(attempt.assessmentId);
      if (!current || new Date(attempt.gradedAt).getTime() > new Date(current.gradedAt).getTime()) {
        map.set(attempt.assessmentId, attempt);
      }
    }
    return map;
  }, [attempts]);

  const stats = useMemo(() => ({
    assessments: assessments.length,
    attempts: attempts.length,
    passed: attempts.filter((attempt) => attempt.passed).length,
    certificatesPending: attempts.filter((attempt) => attempt.passed && attempt.certificatePending).length,
  }), [assessments.length, attempts]);

  const toggleAnswer = (questionId: string, optionId: string, multi: boolean) => {
    setAnswers((current) => {
      const existing = current[questionId] ?? [];
      if (!multi) return { ...current, [questionId]: [optionId] };
      return existing.includes(optionId)
        ? { ...current, [questionId]: existing.filter((id) => id !== optionId) }
        : { ...current, [questionId]: [...existing, optionId] };
    });
  };

  const submitAttempt = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedAssessment) return;
    setSaving(true);
    setFeedback(null);
    try {
      const submittedAt = new Date().toISOString();
      const result = scoreCPDAttempt(selectedAssessment, {
        userId: user.uid,
        assessmentId: selectedAssessment.id,
        answers,
        submittedAt,
      });
      await addDoc(collection(db, 'cpd_attempts'), {
        ...result,
        courseId: selectedAssessment.courseId,
        cpdPoints: selectedAssessment.cpdPoints ?? 0,
        certificatePending: result.passed,
        statutorySyncStatus: 'not_configured',
        answers,
        humanReviewRequired: result.passed,
        createdAt: new Date().toISOString(),
      });
      setFeedback(result.passed ? 'Attempt passed and recorded. Certificate issuance remains pending human/statutory review.' : 'Attempt recorded. Pass mark was not reached.');
      setAnswers({});
    } catch (error) {
      console.error('Failed to submit CPD attempt:', error);
      setFeedback(error instanceof Error ? error.message : 'Unable to submit CPD attempt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="cpd-assessment-page">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest">CPD Assessment</Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3"><BookOpen className="h-7 w-7 text-primary" /> Professional CPD attempts</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">Live CPD assessments from Firestore with browser-safe scoring and persisted attempt records. Certificate generation and statutory-provider sync remain blocked unless real provider credentials are configured.</CardDescription>
            </div>
            <Badge className="capitalize w-fit">{user.role}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {state === 'loading' && <div className="md:col-span-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading CPD assessments...</div>}
          {state === 'error' && <div className="md:col-span-4 text-sm text-destructive">Unable to load CPD assessments. Check Firestore permissions.</div>}
          <MetricCard icon={<ClipboardCheck />} label="Assessments" value={stats.assessments} />
          <MetricCard icon={<BookOpen />} label="Attempts" value={stats.attempts} />
          <MetricCard icon={<CheckCircle2 />} label="Passed" value={stats.passed} />
          <MetricCard icon={<Award />} label="Certificate review" value={stats.certificatesPending} />
        </CardContent>
      </Card>

      {feedback && <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">{feedback}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-6">
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Assessment catalogue</CardTitle><CardDescription>Records from `cpd_assessments`. No sample assessments are generated in the UI.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {assessments.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No CPD assessments are currently published.</p> : assessments.map((assessment) => {
              const latest = latestAttemptByAssessment.get(assessment.id);
              return <button type="button" key={assessment.id} onClick={() => { setSelectedId(assessment.id); setAnswers({}); }} className={`w-full rounded-xl border p-4 text-left text-sm transition-colors ${selectedAssessment?.id === assessment.id ? 'border-primary bg-primary/5' : 'border-border bg-background/60'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{assessment.title || assessment.courseId}</p><p className="text-xs text-muted-foreground">{assessment.questions.length} questions · pass mark {assessment.passMarkPercent}%</p></div>{latest && <Badge variant={latest.passed ? 'default' : 'secondary'}>{latest.scorePercent}%</Badge>}</div></button>;
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Attempt assessment</CardTitle><CardDescription>{selectedAssessment ? `${selectedAssessment.courseId} · ${selectedAssessment.passMarkPercent}% pass mark` : 'Select a published assessment.'}</CardDescription></CardHeader>
          <CardContent>
            {!selectedAssessment ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No assessment selected.</p> : (
              <form onSubmit={submitAttempt} className="space-y-5">
                {selectedAssessment.description && <p className="rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">{selectedAssessment.description}</p>}
                {selectedAssessment.questions.map((question, index) => {
                  const options = optionsForQuestion(question);
                  const selectedAnswers = answers[question.id] ?? [];
                  const multi = question.type === 'multiple_choice';
                  return <div key={question.id} className="rounded-2xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{index + 1}. {question.prompt}</p><p className="mt-1 text-xs text-muted-foreground">{question.type.replace('_', ' ')} · {question.points} points</p></div><Badge variant="secondary">{selectedAnswers.length} selected</Badge></div>{options.length === 0 ? <p className="mt-4 text-sm text-destructive">This question has no answer options configured and cannot be attempted.</p> : <div className="mt-4 grid gap-2">{options.map((option) => <label key={option.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3 text-sm"><input type={multi ? 'checkbox' : 'radio'} name={question.id} checked={selectedAnswers.includes(option.id)} onChange={() => toggleAnswer(question.id, option.id, multi)} /> <span>{option.label}</span></label>)}</div>}</div>;
                })}
                <Button type="submit" disabled={saving || selectedAssessment.questions.some((question) => optionsForQuestion(question).length === 0)}>{saving ? 'Submitting...' : 'Submit CPD attempt'}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardHeader><CardTitle className="font-heading text-xl">Attempt history</CardTitle><CardDescription>Persisted `cpd_attempts` for this user. Passed attempts are marked for certificate/statutory review, not auto-synced.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {attempts.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No CPD attempts recorded yet.</p> : attempts.map((attempt) => <div key={attempt.id} className="rounded-xl border border-border p-4 text-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{attempt.courseId || attempt.assessmentId}</p><p className="text-xs text-muted-foreground">{attempt.score}/{attempt.maxScore} · graded {attempt.gradedAt}</p></div><Badge variant={attempt.passed ? 'default' : 'secondary'}>{attempt.passed ? 'passed' : 'not passed'}</Badge></div>{attempt.certificatePending && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Award className="h-3 w-3" /> Certificate issuance pending human/statutory review.</p>}</div>)}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-background/70 p-4"><div className="flex items-center gap-2 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p></div><p className="mt-3 font-heading text-3xl font-black">{value}</p></div>;
}
