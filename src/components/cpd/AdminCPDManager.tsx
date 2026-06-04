import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { Award, BookOpen, CheckCircle2, FileText, Loader2, Plus, Save, Send, Upload, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import type {
  CPDContentItem,
  CPDAssessmentDraft,
  CPDCourse,
  CPDAccreditationApplication,
  CPDProfessionalBody,
} from '@/services/cpdTypes';
import {
  generateAssessmentDraft,
  validateDraftForHumanReview,
  getProfessionalBodyRuleSet,
  calculateCPDCredits,
} from '@/services/cpdIndex';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type TabId = 'content' | 'assessments' | 'accreditation' | 'courses';

interface AdminCPDManagerProps {
  user: UserProfile;
}

export default function AdminCPDManager({ user }: AdminCPDManagerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('content');
  const [loading, setLoading] = useState(true);
  const [contentItems, setContentItems] = useState<CPDContentItem[]>([]);
  const [assessmentDrafts, setAssessmentDrafts] = useState<CPDAssessmentDraft[]>([]);
  const [accreditations, setAccreditations] = useState<CPDAccreditationApplication[]>([]);
  const [courses, setCourses] = useState<CPDCourse[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Content intake form state
  const [newContent, setNewContent] = useState({
    title: '',
    contentType: 'webinar_recording' as CPDContentItem['contentType'],
    providerName: '',
    presenterNames: '',
    durationMinutes: '60',
    targetBodies: 'SACAP',
    learningOutcomes: '',
    transcript: '',
    permissionStatus: 'owned_by_architex' as CPDContentItem['permissionStatus'],
  });

  // Assessment review form state
  const [editingDraft, setEditingDraft] = useState<CPDAssessmentDraft | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubs: Array<() => void> = [];

    const contentUnsub = onSnapshot(query(collection(db, 'cpd_content_items'), orderBy('title', 'asc')), (snap) => {
      setContentItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDContentItem)));
    }, (err) => console.error(err));
    unsubs.push(contentUnsub);

    const draftsUnsub = onSnapshot(query(collection(db, 'cpd_assessment_drafts'), orderBy('title', 'asc')), (snap) => {
      setAssessmentDrafts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDAssessmentDraft)));
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    unsubs.push(draftsUnsub);

    const accredUnsub = onSnapshot(collection(db, 'cpd_accreditation_applications'), (snap) => {
      setAccreditations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDAccreditationApplication)));
    }, (err) => console.error(err));
    unsubs.push(accredUnsub);

    const coursesUnsub = onSnapshot(query(collection(db, 'cpd_courses'), orderBy('title', 'asc')), (snap) => {
      setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CPDCourse)));
    }, (err) => console.error(err));
    unsubs.push(coursesUnsub);

    return () => unsubs.forEach((u) => u());
  }, []);

  const handleCreateContent = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const id = `content_${Date.now()}`;
      const item: CPDContentItem = {
        id,
        title: newContent.title,
        contentType: newContent.contentType,
        providerName: newContent.providerName,
        presenterNames: newContent.presenterNames.split(',').map((s) => s.trim()).filter(Boolean),
        durationMinutes: parseInt(newContent.durationMinutes) || 60,
        permissionStatus: newContent.permissionStatus,
        targetBodies: newContent.targetBodies.split(',').map((s) => s.trim()) as CPDProfessionalBody[],
        learningOutcomes: newContent.learningOutcomes.split('\n').map((s) => s.trim()).filter(Boolean),
        transcript: newContent.transcript || undefined,
        createdByUserId: user.uid,
      };
      await setDoc(doc(db, 'cpd_content_items', id), item);
      setFeedback(`Content "${item.title}" created.`);
      setNewContent({ title: '', contentType: 'webinar_recording', providerName: '', presenterNames: '', durationMinutes: '60', targetBodies: 'SACAP', learningOutcomes: '', transcript: '', permissionStatus: 'owned_by_architex' });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to create content.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAssessment = async (contentItem: CPDContentItem) => {
    setSaving(true);
    setFeedback(null);
    try {
      const draft = generateAssessmentDraft(contentItem);
      const issues = validateDraftForHumanReview(draft);
      const id = draft.id;
      await setDoc(doc(db, 'cpd_assessment_drafts', id), { ...draft, reviewStatus: 'creator_review', riskFlags: issues });
      setFeedback(`Assessment draft "${draft.title}" generated with ${draft.questions.length} questions. ${issues.length > 0 ? `Issues: ${issues.join('; ')}` : 'Ready for review.'}`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to generate assessment.');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAssessment = async (draft: CPDAssessmentDraft) => {
    setSaving(true);
    setFeedback(null);
    try {
      await updateDoc(doc(db, 'cpd_assessment_drafts', draft.id), { reviewStatus: 'approved_live' });
      setFeedback(`Assessment "${draft.title}" approved and marked live.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to approve assessment.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishCourse = async (draft: CPDAssessmentDraft) => {
    setSaving(true);
    setFeedback(null);
    try {
      const contentItem = contentItems.find((c) => c.id === draft.contentItemId);
      if (!contentItem) throw new Error('Content item not found.');

      const courseId = `course_${draft.contentItemId}`;
      // Calculate estimated credits based on SACAP rules
      const sacapEstimate = calculateCPDCredits({
        professionalBody: 'SACAP',
        approvedCategory: 'category_1_developmental_activity',
        durationHours: (contentItem.durationMinutes || 60) / 60,
      });

      const course: CPDCourse = {
        id: courseId,
        contentItemId: draft.contentItemId,
        assessmentId: draft.id,
        title: contentItem.title,
        approvedCredits: sacapEstimate.calculatedCredits,
        professionalBodies: contentItem.targetBodies,
        providerName: contentItem.providerName,
        certificateTemplateId: 'architex_cpd_certificate_v1',
        status: 'live',
        assessmentPriceRand: 50,
        contentOwnerUserId: contentItem.createdByUserId,
        monetizationEnabled: true,
        commercialModel: 'paid_webinar_addon_assessment',
        pricingBasis: 'admin_fixed',
        approvedCategory: 'category_1_developmental_activity',
        expectedAssessmentMinutes: draft.timeLimitMinutes || 20,
      };
      await setDoc(doc(db, 'cpd_courses', courseId), course);
      setFeedback(`Course "${course.title}" published as live.`);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to publish course.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; count: number }> = [
    { id: 'content', label: 'Content Items', icon: <FileText className="h-4 w-4" />, count: contentItems.length },
    { id: 'assessments', label: 'Assessment Drafts', icon: <BookOpen className="h-4 w-4" />, count: assessmentDrafts.length },
    { id: 'accreditation', label: 'Accreditation', icon: <Award className="h-4 w-4" />, count: accreditations.length },
    { id: 'courses', label: 'Live Courses', icon: <Users className="h-4 w-4" />, count: courses.filter((c) => c.status === 'live').length },
  ];

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading CPD admin...</div>;
  }

  return (
    <div className="space-y-6" data-testid="admin-cpd-manager">
      <Card className="rounded-[2rem] border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <Badge variant="secondary" className="uppercase tracking-widest">Admin</Badge>
          <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-primary" /> CPD Content &amp; Assessment Manager
          </CardTitle>
          <CardDescription className="mt-2 text-base">
            Manage CPD content, generate AI assessment drafts, review questions, track accreditation, and publish courses.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span className="ml-2">{tab.label}</span>
                <Badge variant="secondary" className="ml-2">{tab.count}</Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {feedback && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">{feedback}</div>
      )}

      {/* Content Intake */}
      {activeTab === 'content' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl">New Content Item</CardTitle>
              <CardDescription>Upload webinar, article, or training content for CPD assessment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Title" value={newContent.title} onChange={(e) => setNewContent({ ...newContent, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-xl border border-border bg-background p-3 text-sm" value={newContent.contentType} onChange={(e) => setNewContent({ ...newContent, contentType: e.target.value as any })}>
                  <option value="webinar_recording">Webinar Recording</option>
                  <option value="live_webinar">Live Webinar</option>
                  <option value="article">Article</option>
                  <option value="refereed_article">Refereed Article</option>
                  <option value="slide_deck">Slide Deck</option>
                  <option value="platform_training_course">Platform Training</option>
                </select>
                <select className="rounded-xl border border-border bg-background p-3 text-sm" value={newContent.permissionStatus} onChange={(e) => setNewContent({ ...newContent, permissionStatus: e.target.value as any })}>
                  <option value="owned_by_architex">Owned by Architex</option>
                  <option value="partner_permission_granted">Partner Permission</option>
                  <option value="permission_required">Permission Required</option>
                </select>
              </div>
              <Input placeholder="Provider Name" value={newContent.providerName} onChange={(e) => setNewContent({ ...newContent, providerName: e.target.value })} />
              <Input placeholder="Presenters (comma-separated)" value={newContent.presenterNames} onChange={(e) => setNewContent({ ...newContent, presenterNames: e.target.value })} />
              <Input placeholder="Duration (minutes)" type="number" value={newContent.durationMinutes} onChange={(e) => setNewContent({ ...newContent, durationMinutes: e.target.value })} />
              <Input placeholder="Target Bodies (comma-separated, e.g. SACAP,ECSA)" value={newContent.targetBodies} onChange={(e) => setNewContent({ ...newContent, targetBodies: e.target.value })} />
              <textarea className="rounded-xl border border-border bg-background p-3 text-sm w-full min-h-[80px]" placeholder="Learning outcomes (one per line)" value={newContent.learningOutcomes} onChange={(e) => setNewContent({ ...newContent, learningOutcomes: e.target.value })} />
              <textarea className="rounded-xl border border-border bg-background p-3 text-sm w-full min-h-[120px]" placeholder="Transcript or content summary" value={newContent.transcript} onChange={(e) => setNewContent({ ...newContent, transcript: e.target.value })} />
              <Button onClick={handleCreateContent} disabled={saving || !newContent.title}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Create Content Item
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader><CardTitle className="font-heading text-xl">Content Library</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {contentItems.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">No content items yet.</p>
              ) : (
                contentItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.contentType} · {item.providerName} · {item.durationMinutes} min · {item.learningOutcomes.length} outcomes</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleGenerateAssessment(item)} disabled={saving}>
                        <Send className="h-3 w-3 mr-1" /> Generate Assessment
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Assessment Drafts */}
      {activeTab === 'assessments' && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Assessment Drafts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {assessmentDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">No assessment drafts. Generate one from a content item.</p>
            ) : (
              assessmentDrafts.map((draft) => {
                const issues = validateDraftForHumanReview(draft);
                return (
                  <div key={draft.id} className="rounded-xl border border-border p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold">{draft.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {draft.questions.length} questions · {draft.passMarkPercent}% pass · {draft.allowedAttempts} attempts
                          {draft.timeLimitMinutes && ` · ${draft.timeLimitMinutes} min`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Question types: {[...new Set(draft.questions.map((q) => q.type))].join(', ')}
                        </p>
                        <Badge className="mt-1" variant={draft.reviewStatus === 'approved_live' ? 'default' : 'secondary'}>
                          {draft.reviewStatus}
                        </Badge>
                        {issues.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {issues.map((issue, i) => (
                              <p key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {issue}</p>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {draft.reviewStatus !== 'approved_live' && (
                          <Button size="sm" variant="default" onClick={() => handleApproveAssessment(draft)} disabled={saving}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                          </Button>
                        )}
                        {draft.reviewStatus === 'approved_live' && (
                          <Button size="sm" variant="default" onClick={() => handlePublishCourse(draft)} disabled={saving}>
                            <Upload className="h-3 w-3 mr-1" /> Publish Course
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Question preview */}
                    {draft.questions.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-primary">
                          Preview {draft.questions.length} questions
                        </summary>
                        <div className="mt-3 space-y-3">
                          {draft.questions.map((q, qi) => (
                            <div key={q.id} className="rounded-lg border border-border p-3 text-xs">
                              <p className="font-semibold">{qi + 1}. {q.prompt}</p>
                              <p className="text-muted-foreground">{q.type} · {q.difficulty} · {q.points}pt · LO: {q.learningOutcome}</p>
                              <div className="mt-1 space-y-0.5">
                                {q.options.map((opt) => (
                                  <p key={opt.id} className={q.correctOptionIds?.includes(opt.id) ? 'text-green-600' : ''}>
                                    {opt.id}: {opt.label} {q.correctOptionIds?.includes(opt.id) ? '✓' : ''}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* Accreditation */}
      {activeTab === 'accreditation' && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Accreditation Applications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {accreditations.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">No accreditation applications yet.</p>
            ) : (
              accreditations.map((app) => (
                <div key={app.id} className="rounded-xl border border-border p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{app.courseId}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Provider: {app.provider} · Bodies: {app.targetBodies.join(', ')} · Mode: {app.connectorMode}
                      </p>
                      <p className="text-xs text-muted-foreground">Requested: {app.requestedCredits} · Approved: {app.approvedCredits ?? '—'}</p>
                      {app.accreditationReference && <p className="text-xs text-muted-foreground">Ref: {app.accreditationReference}</p>}
                    </div>
                    <Badge variant={app.status === 'accredited' ? 'default' : 'secondary'}>{app.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Live Courses */}
      {activeTab === 'courses' && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader><CardTitle className="font-heading text-xl">Live Courses</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">No courses published yet.</p>
            ) : (
              courses.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{c.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.providerName} · {c.approvedCredits} credits · {c.professionalBodies?.join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.accreditationReference && `Accred: ${c.accreditationReference} · `}
                        Valid: {c.validFrom || '—'} to {c.validUntil || '—'}
                      </p>
                      {c.monetizationEnabled && c.assessmentPriceRand && (
                        <p className="text-xs text-muted-foreground">Price: R {c.assessmentPriceRand} · Model: {c.commercialModel}</p>
                      )}
                    </div>
                    <Badge variant={c.status === 'live' ? 'default' : 'secondary'}>{c.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
