import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AgentKnowledge, KnowledgeStatus, KnowledgeSource, UserProfile } from '../types';
import { getAllAgentKnowledge, approveKnowledge, rejectKnowledge, deleteKnowledge, updateKnowledge } from '../services/knowledgeService';
import { SPECIALIZED_AGENTS } from '../services/geminiService';
import { Loader2, CheckCircle2, XCircle, Search, Trash2, Edit } from 'lucide-react';

export default function AgentKnowledgeManager({ user }: { user: UserProfile }) {
  const [activeTab, setActiveTab] = useState<KnowledgeStatus>('pending_review');
  const [entries, setEntries] = useState<AgentKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [editingEntry, setEditingEntry] = useState<AgentKnowledge | null>(null);
  const [editContent, setEditContent] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  useEffect(() => {
    fetchKnowledge();
  }, [activeTab]);

  const fetchKnowledge = async () => {
    setLoading(true);
    try {
      const allEntries = await getAllAgentKnowledge(activeTab);

      // Sort by newest first
      allEntries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setEntries(allEntries);
    } catch (error) {
      console.error("Failed to fetch knowledge:", error);
      // If permission denied, show empty list gracefully
      if (error.message?.includes('permission-denied')) {
        console.warn("Permission denied for agent knowledge, showing empty list");
        setEntries([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (entryId: string) => {
    if (!user) return;
    try {
      await approveKnowledge(entryId, user.uid);
      setEntries(entries.filter(e => e.id !== entryId));
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  const handleReject = async (entryId: string) => {
    if (!user || !rejectReason.trim()) return;
    try {
      await rejectKnowledge(entryId, user.uid, rejectReason);
      setEntries(entries.filter(e => e.id !== entryId));
      setRejectingId(null);
      setRejectReason('');
    } catch (error) {
      console.error("Failed to reject:", error);
    }
  };

  const handleDelete = async (entryId: string) => {
    try {
      await deleteKnowledge(entryId);
      setEntries(entries.filter(e => e.id !== entryId));
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !editContent.trim()) return;
    try {
      await updateKnowledge(editingEntry.id, editContent);
      setEntries(entries.map(e => e.id === editingEntry.id ? { ...e, content: editContent } : e));
      setEditingEntry(null);
    } catch (error) {
      console.error("Failed to update:", error);
    }
  };

  const getSourceBadgeColor = (source: KnowledgeSource) => {
    switch (source) {
      case 'documentation': return 'bg-blue-500 hover:bg-blue-600';
      case 'human_feedback': return 'bg-purple-500 hover:bg-purple-600';
      case 'self_improvement': return 'bg-green-500 hover:bg-green-600';
      case 'web_search': return 'bg-orange-500 hover:bg-orange-600';
      default: return 'bg-gray-500';
    }
  };

  const getSourceLabel = (source: KnowledgeSource) => {
    switch (source) {
      case 'documentation': return 'Documentation';
      case 'human_feedback': return 'Human Feedback';
      case 'self_improvement': return 'AI Self-Improvement';
      case 'web_search': return 'Web Search';
      default: return source;
    }
  };

  const filteredEntries = selectedAgentId === 'all' 
    ? entries 
    : entries.filter(e => e.agentId === selectedAgentId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Agent Knowledge Base</h2>
          <p className="text-muted-foreground">Manage and review what the AI agents have learned.</p>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-border pb-4">
        {(['pending_review', 'active', 'rejected'] as KnowledgeStatus[]).map((status) => (
          <Button
            key={status}
            variant={activeTab === status ? "default" : "outline"}
            onClick={() => setActiveTab(status)}
            className="capitalize"
          >
            {status.replace('_', ' ')}
            {activeTab === status && entries.length > 0 && (
              <Badge variant="secondary" className="ml-2">{entries.length}</Badge>
            )}
          </Button>
        ))}
      </div>

      <div className="flex gap-4 items-center">
         <Search className="w-4 h-4 text-muted-foreground" />
         <select 
           className="flex h-10 w-[250px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
           value={selectedAgentId}
           onChange={(e) => setSelectedAgentId(e.target.value)}
         >
           <option value="all">All Agents</option>
           {SPECIALIZED_AGENTS.map(agent => (
             <option key={agent.role} value={agent.role}>{agent.name}</option>
           ))}
         </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card text-muted-foreground">
          No knowledge entries found for this status.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getSourceBadgeColor(entry.source)}>
                        {getSourceLabel(entry.source)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Agent: <strong className="text-foreground">{entry.agentRole}</strong>
                      </span>
                    </div>
                    <CardTitle className="text-lg">{entry.title}</CardTitle>
                    <CardDescription>
                      Submitted by {entry.submittedByRole} on {new Date(entry.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2">
                    {activeTab === 'pending_review' && (
                      <>
                        <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700" onClick={() => handleApprove(entry.id)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setRejectingId(entry.id)}>
                          <XCircle className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => {
                      setEditingEntry(entry);
                      setEditContent(entry.content);
                    }}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(entry.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {rejectingId === entry.id ? (
                  <div className="flex gap-2 mt-2 bg-muted p-2 rounded-md">
                    <Input 
                      placeholder="Reason for rejection..." 
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                    <Button size="sm" variant="destructive" onClick={() => handleReject(entry.id)}>Confirm Reject</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)}>Cancel</Button>
                  </div>
                ) : editingEntry?.id === entry.id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea 
                      value={editContent} 
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={5}
                      className="font-mono text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingEntry(null)}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveEdit}>Save Changes</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm whitespace-pre-wrap rounded-md bg-muted p-4 border border-border">
                    {entry.content}
                  </div>
                )}
                
                {entry.tags && entry.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1">
                    {entry.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                
                {entry.status === 'rejected' && entry.rejectionReason && (
                   <div className="mt-3 text-sm text-destructive font-medium p-2 border border-destructive/20 bg-destructive/5 rounded-md">
                     Rejected: {entry.rejectionReason}
                   </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
