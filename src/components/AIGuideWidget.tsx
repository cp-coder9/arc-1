/**
 * AI Guide Widget — embeds AI recommendations with title, rationale, priority,
 * action labels, and routes. Handles AI unavailability gracefully.
 *
 * Consumes `aiGuidanceService` to surface AI-generated guidance at dashboard,
 * tool, and workflow-step scopes. Never executes sensitive gates autonomously;
 * gates requiring human approval are marked advisory and routed to qualified
 * roles. Every interactive control is keyboard-reachable with visible focus
 * indicators and accessible names (R6.1, R6.10, R6.11, 10.3).
 */

import React, { useEffect, useState } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, ChevronRight, Lightbulb } from 'lucide-react';
import type {
  AgentRecommendation,
  AuthorizationContext,
  GuidanceRequest,
  GuidanceResult,
  ProjectPassport,
} from '@/services/orchestration/orchestrationTypes';
import { createAiGuidanceService } from '@/services/orchestration/aiGuidanceService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AIGuideWidgetProps {
  /** Authorization context (tenantId, userId, role, now). */
  ctx: AuthorizationContext;
  /** The reconciled project passport (source of truth). */
  passport: ProjectPassport;
  /** Surface scope (dashboard, tool, or workflow_step). */
  surface: 'dashboard' | 'tool' | 'workflow_step';
  /** Optional callback when a recommendation route is clicked. */
  onRecommendationClick?: (route: string) => void;
  /** Optional compact mode (show first N recommendations). */
  compact?: boolean;
}

/** Priority display colors. */
const PRIORITY_COLOR: Record<string, string> = {
  High: 'bg-destructive/10 text-destructive border-destructive/30',
  Medium: 'bg-blue-50 text-blue-800 border-blue-200',
  Low: 'bg-secondary text-secondary-foreground border-border',
};

const PRIORITY_BADGE: Record<string, string> = {
  High: 'bg-destructive text-destructive-foreground',
  Medium: 'bg-blue-600 text-white',
  Low: 'bg-secondary text-secondary-foreground',
};

interface RecommendationItemProps {
  recommendation: AgentRecommendation;
  onNavigate: (route: string) => void;
}

const RecommendationItem: React.FC<RecommendationItemProps> = ({ recommendation, onNavigate }) => {
  const handleClick = () => {
    if (recommendation.relatedRoute) {
      onNavigate(recommendation.relatedRoute);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && recommendation.relatedRoute) {
      e.preventDefault();
      handleClick();
    }
  };

  const gateLabel = recommendation.requiresHumanApproval ? ' (requires human approval)' : '';

  return (
    <button
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`w-full text-left rounded-2xl border p-4 space-y-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary hover:border-primary ${PRIORITY_COLOR[recommendation.priority]}`}
      aria-label={`${recommendation.title}. ${recommendation.rationale}${gateLabel}. Press Enter to open related route.`}
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-semibold text-sm">{recommendation.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{recommendation.rationale}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="outline" className={PRIORITY_BADGE[recommendation.priority]}>
            {recommendation.priority}
          </Badge>
          {recommendation.relatedRoute && (
            <ChevronRight className="text-muted-foreground" size={16} aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {recommendation.recommendedActionLabel}
        </Badge>
        {recommendation.requiresHumanApproval && (
          <Badge
            variant="outline"
            className="text-xs border-amber-200 bg-amber-50 text-amber-700"
            title="This action requires human review or approval"
          >
            Advisory
          </Badge>
        )}
      </div>
    </button>
  );
}

export function AIGuideWidget({
  ctx,
  passport,
  surface,
  onRecommendationClick,
  compact = false,
}: AIGuideWidgetProps) {
  const [guidance, setGuidance] = useState<GuidanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const guidanceService = createAiGuidanceService();

  // Generate guidance when props change (R6.1, R6.10)
  useEffect(() => {
    let isMounted = true;

    const generateGuidance = async () => {
      setLoading(true);
      setError(null);
      try {
        const request: GuidanceRequest = {
          ctx,
          surface,
          passport,
        };
        const result = await guidanceService.generateGuidance(request);
        if (isMounted) {
          setGuidance(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to generate guidance');
          setGuidance({
            recommendations: [],
            status: 'unavailable',
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    generateGuidance();

    return () => {
      isMounted = false;
    };
  }, [ctx, passport, surface]);

  const displayedRecommendations = guidance?.recommendations
    ? compact
      ? guidance.recommendations.slice(0, 3)
      : guidance.recommendations
    : [];

  const showEmpty = guidance && guidance.status === 'none';
  const showUnavailable = guidance && guidance.status === 'unavailable';

  const handleNavigate = (route: string) => {
    if (onRecommendationClick) {
      onRecommendationClick(route);
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading">
          <Sparkles className="text-primary" size={20} />
          <span>AI Guidance</span>
        </CardTitle>
      </CardHeader>

      <CardContent
        className="flex-1 p-6 space-y-4 overflow-y-auto"
        role="region"
        aria-label="AI recommendations and guidance"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p>Generating guidance…</p>
            </div>
          </div>
        ) : showUnavailable ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-amber-700 flex-shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm font-semibold text-amber-900">Guidance temporarily unavailable</p>
                <p className="text-xs text-amber-700">
                  AI recommendation generation timed out. The system is still responsive; try refreshing the page.
                </p>
              </div>
            </div>
          </div>
        ) : showEmpty ? (
          <div className="text-center py-8 text-muted-foreground">
            <Lightbulb className="mx-auto text-muted-foreground/50 mb-2" size={32} />
            <p className="text-sm font-medium">No recommendations available</p>
            <p className="text-xs">All required actions are current. Great progress!</p>
          </div>
        ) : displayedRecommendations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium">No recommendations at this time</p>
          </div>
        ) : (
          displayedRecommendations.map((rec) => (
            <RecommendationItem key={rec.id} recommendation={rec} onNavigate={handleNavigate} />
          ))
        )}

        {/* Step-level guidance for tool and workflow surfaces (R6.4) */}
        {guidance?.stepGuidance && surface !== 'dashboard' && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="text-blue-700 flex-shrink-0 mt-0.5" size={16} />
              <div>
                <p className="text-sm font-semibold text-blue-900">Step guidance</p>
                <p className="text-xs text-blue-700 mt-1">{guidance.stepGuidance}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {compact && displayedRecommendations.length > 0 && displayedRecommendations.length < (guidance?.recommendations.length ?? 0) && (
        <div className="border-t border-border p-4 bg-secondary/5">
          <Button
            variant="outline"
            className="w-full rounded-xl gap-2"
            onClick={() => onRecommendationClick && onRecommendationClick(`/projects/${passport.projectId}/guidance`)}
            aria-label="View all AI recommendations"
          >
            View All Recommendations
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {error && (
        <div className="border-t border-border p-4 bg-destructive/5">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </Card>
  );
}
