import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { Award, BookOpen, CheckCircle2, FileText, Loader2, Plus, Send, Upload, Users } from 'lucide-react';
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
  calculateCPDCredits,
} from '@/services/cpdIndex';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { GlassTable, type Column } from '@/components/composite/GlassTable';

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

  // ── GlassTable column definitions ────────────────────────────────────────

  const contentColumns: Column<CPDContentItem>[] = [
    { key: 'title', label: 'Title', render: (_, row) => <span className="font-semibold">{row.title}</span> },
    { key: 'contentType', label: 'Type' },
    { key: 'providerName', label: 'Provider' },
    { key: 'durationMinutes', label: 'Duration', render: (v) => `${v} min` },
    {
      key: 'id', label: 'Actions', render: (_, row) => (
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleGenerateAssessment(row); }} disabled={saving}>
          <Send className="h-3 w-3 mr-1" /> Generate Assessment
        </Button>
      ),
    },
  ];

  const assessmentColumns: Column<CPDAssessmentDraft>[] = [
    { key: 'title', label: 'Title', render: (_, row) => <span className="font-semibold">{row.title}</span> },
    { key: 'questions', label: 'Questions', render: (_, row) => `${row.questions.length} questions` },
    { key: 'passMarkPercent', label: 'Pass Mark', render: (v) => `${v}%` },
    {
      key: 'reviewStatus', label: 'Status', render: (v) => (
        <Badge className="glass-pill" variant={v === 'approved_live' ? 'default' : 'secondary'}>
          {String(v)}
        </Badge>
      ),
    },
    {
      key: 'id', label: 'Actions', render: (_, row) => (
        <div className="flex gap-2">
          {row.reviewStatus !== 'approved_live' && (
            <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); handleApproveAssessment(row); }} disabled={saving}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
            </Button>
          )}
          {row.reviewStatus === 'approved_live' && (
            <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); handlePublishCourse(row); }} disabled={saving}>
              <Upload className="h-3 w-3 mr-1" /> Publish Course
            </Button>
          )}
        </div>
      ),
    },
  ];

  const accreditationColumns: Column<CPDAccreditationApplication>[] = [
    { key: 'courseId', label: 'Course' },
    { key: 'provider', label: 'Provider' },
    { key: 'targetBodies', label: 'Bodies', render: (_, row) => row.targetBodies.join(', ') },
    { key: 'requestedCredits', label: 'Requested' },
    { key: 'approvedCredits', label: 'Approved', render: (v) => v ?? '—' },
    {
      key: 'status', label: 'Status', render: (v) => (
        <Badge className="glass-pill" variant={v === 'accredited' ? 'default' : 'secondary'}>
          {String(v)}
        </Badge>
      ),
    },
  ];

  const courseColumns: Column<CPDCourse>[] = [
    { key: 'title', label: 'Title', render: (_, row) => <span className="font-semibold">{row.title}</span> },
    { key: 'providerName', label: 'Provider' },
    { key: 'approvedCredits', label: 'Credits' },
    { key: 'professionalBodies', label: 'Bodies', render: (_, row) => row.professionalBodies?.join(', ') || '—' },
    {
      key: 'assessmentPriceRand', label: 'Price', render: (_, row) => (
        row.monetizationEnabled && row.assessmentPriceRand
          ? `R ${row.assessmentPriceRand}`
          : 'Partner Sponsored'
      ),
    },
    {
      key: 'status', label: 'Status', render: (v) => (
        <Badge className="glass-pill" variant={v === 'live' ? 'default' : 'secondary'}>
          {String(v)}
        </Badge>
      ),
    },
  ];

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading compliance admin...</div>;
  }

  return (
    <div className="space-y-6" data-testid="admin-cpd-manager">
      <DashboardSection
        title="Compliance Content & Assessment Manager"
        description="Manage compliance content, generate assessment drafts, review questions, track accreditation, and publish courses."
        icon={<BookOpen className="h-5 w-5" />}
      >
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
              <Badge variant="secondary" className="glass-pill ml-2">{tab.count}</Badge>
            </Button>
          ))}
        </div>
      </DashboardSection>

      {feedback && (
        <div className="glass-panel rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">{feedback}</div>
      )}

      {/* Content Intake */}
      {activeTab === 'content' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DashboardSection title="New Content Item" description="Upload webinar, article, or training content for compliance assessment." icon={<Plus className="h-5 w-5" />}>
            <div className="space-y-3">
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
            </div>
          </DashboardSection>

          <DashboardSection title="Content Library" icon={<FileText className="h-5 w-5" />}>
            <GlassTable<CPDContentItem>
              columns={contentColumns}
              rows={contentItems}
              rowKey="id"
              emptyState="No content items yet."
            />
          </DashboardSection>
        </div>
      )}

      {/* Assessment Drafts */}
      {activeTab === 'assessments' && (
        <DashboardSection title="Assessment Drafts" icon={<BookOpen className="h-5 w-5" />}>
          <GlassTable<CPDAssessmentDraft>
            columns={assessmentColumns}
            rows={assessmentDrafts}
            rowKey="id"
            emptyState="No assessment drafts. Generate one from a content item."
          />
        </DashboardSection>
      )}

      {/* Accreditation */}
      {activeTab === 'accreditation' && (
        <DashboardSection title="Accreditation Applications" icon={<Award className="h-5 w-5" />}>
          <GlassTable<CPDAccreditationApplication>
            columns={accreditationColumns}
            rows={accreditations}
            rowKey="id"
            emptyState="No accreditation applications yet."
          />
        </DashboardSection>
      )}

      {/* Live Courses */}
      {activeTab === 'courses' && (
        <DashboardSection title="Live Courses" icon={<Users className="h-5 w-5" />}>
          <GlassTable<CPDCourse>
            columns={courseColumns}
            rows={courses}
            rowKey="id"
            emptyState="No courses published yet."
          />
        </DashboardSection>
      )}
    </div>
  );
}
