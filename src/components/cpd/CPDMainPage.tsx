import React, { useState } from 'react';
import { Award, BarChart3, BookOpen, FileText, GraduationCap, Settings } from 'lucide-react';
import type { UserProfile } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CPDHub from './CPDHub';
import CPDAssessmentRunner from './CPDAssessmentRunner';
import CPDCertificateViewer from './CPDCertificateViewer';
import CPDAnalyticsDashboard from './CPDAnalyticsDashboard';

type CPDView = 'hub' | 'assessment' | 'certificate' | 'analytics';

interface CPDMainPageProps {
  user: UserProfile;
  onNavigate?: (page: string) => void;
}

export default function CPDMainPage({ user, onNavigate }: CPDMainPageProps) {
  const [view, setView] = useState<CPDView>('hub');
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>();
  const [selectedCertificateId, setSelectedCertificateId] = useState<string | undefined>();
  const isAdmin = user.role === 'admin';

  const handleNavigate = (target: string) => {
    if (target.startsWith('cpd-assessment:')) {
      setSelectedCourseId(target.replace('cpd-assessment:', ''));
      setView('assessment');
    } else if (target.startsWith('cpd-certificate:')) {
      setSelectedCertificateId(target.replace('cpd-certificate:', ''));
      setView('certificate');
    } else if (target === 'cpd-hub') {
      setView('hub');
    } else if (target === 'cpd-analytics') {
      setView('analytics');
    } else {
      onNavigate?.(target);
    }
  };

  return (
    <div className="space-y-6" data-testid="cpd-main-page">
      {/* CPD Sub-navigation */}
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={view === 'hub' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('hub')}
            >
              <GraduationCap className="h-4 w-4 mr-2" /> CPD Hub
            </Button>
            {selectedCourseId && (
              <Button
                variant={view === 'assessment' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('assessment')}
              >
                <BookOpen className="h-4 w-4 mr-2" /> Assessment
              </Button>
            )}
            {selectedCertificateId && (
              <Button
                variant={view === 'certificate' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('certificate')}
              >
                <Award className="h-4 w-4 mr-2" /> Certificate
              </Button>
            )}
            <Button
              variant={view === 'analytics' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setView('analytics')}
            >
              <BarChart3 className="h-4 w-4 mr-2" /> Analytics
            </Button>
            <div className="flex-1" />
            <Badge variant="secondary">{isAdmin ? 'Admin' : 'Learner'}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* CPD Views */}
      {view === 'hub' && <CPDHub user={user} onNavigate={handleNavigate} />}
      {view === 'assessment' && (
        <CPDAssessmentRunner
          user={user}
          courseId={selectedCourseId}
          onCertificateView={(certId) => {
            setSelectedCertificateId(certId);
            setView('certificate');
          }}
        />
      )}
      {view === 'certificate' && (
        <CPDCertificateViewer certificateId={selectedCertificateId} user={user} />
      )}
      {view === 'analytics' && (
        <CPDAnalyticsDashboard user={user} lecturerMode={!isAdmin} />
      )}
    </div>
  );
}
