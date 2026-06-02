import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KnowledgeCitation } from '../types';
import { BookOpen, FileText, Link as LinkIcon, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KnowledgeSourcesProps {
  citations: KnowledgeCitation[];
  className?: string;
}

export function KnowledgeSources({ citations, className }: KnowledgeSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!citations || citations.length === 0) {
    return null;
  }

  const displayedCitations = isExpanded ? citations : citations.slice(0, 3);

  return (
    <Card className={cn("bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-base">
              Knowledge Sources Used
            </CardTitle>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            {citations.length} sources
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayedCitations.map((citation, index) => (
            <div
              key={citation.knowledgeId}
              className="p-3 bg-white rounded-lg border border-blue-100 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-blue-600">
                      Source {index + 1}
                    </span>
                    {citation.source === 'documentation' && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        <FileText className="h-2 w-2 mr-1" />
                        Documentation
                      </Badge>
                    )}
                    {citation.source === 'web_search' && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        <LinkIcon className="h-2 w-2 mr-1" />
                        Web Search
                      </Badge>
                    )}
                    {citation.source === 'human_feedback' && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        Human Verified
                      </Badge>
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-gray-900 mb-1">
                    {citation.title}
                  </h4>
                  <p className="text-xs text-gray-600 line-clamp-2">
                    {citation.content}
                  </p>
                  {citation.tags && citation.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {citation.tags.slice(0, 5).map(tag => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[8px] h-4 px-1 bg-blue-50 text-blue-700"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {(citation.pdfUrl || citation.sourceUrl) && (
                    <div className="mt-2">
                      <a
                        href={citation.pdfUrl || citation.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Source
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {citations.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full mt-3 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Show All {citations.length} Sources
              </>
            )}
          </Button>
        )}

        <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-800">
            <strong>Why this matters:</strong> These knowledge sources were automatically referenced by the AI agents during analysis to ensure accurate, regulation-compliant feedback. This prevents AI hallucination by grounding decisions in verified regulations and standards.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
