import React, { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { MessageSquarePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { addKnowledge } from '../services/knowledgeService';
import { AIIssue, UserRole } from '../types';
import { auth } from '../lib/firebase';

interface KnowledgeFeedbackProps {
  agentRole: string;
  categoryName: string;
  issue: AIIssue;
  userRole?: 'admin' | 'architect' | 'client' | 'freelancer' | 'bep';
}

export function KnowledgeFeedback({ agentRole, categoryName, issue, userRole }: KnowledgeFeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) {
      toast.error("Please enter your feedback.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast.error("You must be logged in to provide feedback.");
      return;
    }

    setIsSubmitting(true);
    try {
      await addKnowledge({
        agentId: agentRole,
        agentRole: agentRole,
        title: `Correction for: ${issue.description.substring(0, 50)}...`,
        content: `Original AI Action Item: ${issue.actionItem}\n\nHuman Correction: ${comment}`,
        source: 'human_feedback',
        status: 'pending_review',
        submittedBy: user.uid,
        submittedByRole: (userRole || 'architect') as any,
        tags: [categoryName, 'correction'],
        createdAt: new Date().toISOString()
      });
      
      toast.success("Feedback submitted. A system admin will review it to train the agents.");
      setIsOpen(false);
      setComment('');
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit feedback.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] uppercase tracking-widest gap-1 hover:text-primary">
          <MessageSquarePlus size={12} /> Correct AI
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 border-border rounded-xl shadow-xl z-50">
        <div className="space-y-4">
          <h4 className="font-bold text-sm">Provide AI Correction</h4>
          <p className="text-xs text-muted-foreground">
            Is this flagged issue incorrect? Provide the correct SANS 10400 regulation or context to train the AI.
          </p>
          <Textarea 
            placeholder="e.g. SANS 10400-K actually allows 110mm for this specific internal non-loadbearing wall..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="text-xs min-h-[100px] resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
