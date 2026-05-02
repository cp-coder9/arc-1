import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AgentKnowledge, KnowledgeSource, Discipline, StandardFamily } from '../types';
import { addKnowledge } from '../services/knowledgeService';
import { SPECIALIZED_AGENTS } from '../services/geminiService';
import { Upload, FileText, Plus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../lib/firebase';
import { uploadAndTrackFile } from '../lib/uploadService';

interface AdminKnowledgeUploaderProps {
  user: any;
}

export default function AdminKnowledgeUploader({ user }: AdminKnowledgeUploaderProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'manual' | 'pdf'>('manual');
  const [standardFamily, setStandardFamily] = useState<StandardFamily>('SANS10400');
  const [standardPart, setStandardPart] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [province, setProvince] = useState('');
  const [discipline, setDiscipline] = useState<Discipline>('architecture');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [version, setVersion] = useState('');
  const [disclaimer, setDisclaimer] = useState('Summary only — refer to official SANS document for authoritative text.');

  const metadata = { standardFamily, standardPart, municipality, province, discipline, effectiveDate, reviewDate, version, disclaimer };
  const knowledgeStatus = user.role === 'admin' ? 'active' : 'pending_review';
  const submittedByRole = user.role || 'architect';

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handlePdfUpload = async (file: File) => {
    try {
      const url = await uploadAndTrackFile(file, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedBy: user.uid,
        context: 'knowledge_base',
      });
      
      // Here you would typically trigger PDF text extraction
      // For now, we'll just store the PDF URL
      toast.success('PDF uploaded. Extracting content...');
      
      // Create knowledge entry for PDF
      await addKnowledge({
        agentId: selectedAgent === 'all' ? 'general' : selectedAgent,
        agentRole: selectedAgent === 'all' ? 'all' : selectedAgent,
        title: title || file.name.replace('.pdf', ''),
        content: `[PDF Document](${url})\n\n*Content extraction pending implementation. Please manually add key points from this PDF in the content field below.*`,
        source: 'documentation',
        status: knowledgeStatus,
        submittedBy: user.uid,
        submittedByRole,
        pdfUrl: url,
        tags: [...tags, 'pdf', 'uploaded'],
        ...metadata,
        createdAt: new Date().toISOString(),
      });

      toast.success('PDF uploaded successfully! Please review and edit the extracted content.');
      resetForm();
    } catch (error) {
      console.error('PDF upload error:', error);
      toast.error('Failed to upload PDF');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Please provide both title and content');
      return;
    }

    setIsUploading(true);
    try {
      await addKnowledge({
        agentId: selectedAgent === 'all' ? 'general' : selectedAgent,
        agentRole: selectedAgent === 'all' ? 'all' : selectedAgent,
        title,
        content,
        source: 'documentation',
        status: knowledgeStatus,
        submittedBy: user.uid,
        submittedByRole,
        pdfUrl: pdfFile ? undefined : undefined,
        tags: [...tags, 'admin_uploaded'],
        ...metadata,
        createdAt: new Date().toISOString(),
      });

      toast.success('Knowledge added successfully!');
      resetForm();
    } catch (error) {
      console.error('Failed to add knowledge:', error);
      toast.error('Failed to add knowledge');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setSelectedAgent('all');
    setTags([]);
    setTagInput('');
    setPdfFile(null);
    setStandardPart('');
    setMunicipality('');
    setProvince('');
    setEffectiveDate('');
    setReviewDate('');
    setVersion('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Add Knowledge to Agent Base
        </CardTitle>
        <CardDescription>
          Upload PDFs or manually enter regulations, standards, and guidelines for AI agents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={uploadMode === 'manual' ? 'default' : 'outline'}
            onClick={() => setUploadMode('manual')}
            className="flex-1"
          >
            <FileText className="mr-2 h-4 w-4" />
            Manual Entry
          </Button>
          <Button
            variant={uploadMode === 'pdf' ? 'default' : 'outline'}
            onClick={() => setUploadMode('pdf')}
            className="flex-1"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload PDF
          </Button>
        </div>

        {uploadMode === 'pdf' ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Upload PDF Document</label>
              <div className="border-2 border-dashed border-input rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="pdf-upload"
                />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {pdfFile ? pdfFile.name : 'Click to upload PDF'}
                  </p>
                </label>
              </div>
            </div>
            
            {pdfFile && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm">{pdfFile.name}</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPdfFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Title (Optional)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Knowledge title (defaults to PDF name)"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Agent/Role</label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value="all">All Agents</option>
                {SPECIALIZED_AGENTS.map(agent => (
                  <option key={agent.role} value={agent.role}>{agent.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., SANS 10400-K Wall Thickness Requirements"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Content/Regulation Text</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter the regulation, standard, or guideline text here..."
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </>
        )}

        {/* Tags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Discipline</label>
            <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)}>
              {(['architecture', 'structure', 'fire', 'accessibility', 'energy', 'drainage', 'electrical', 'mechanical', 'planning', 'documentation', 'environmental', 'nhbrc', 'coordination'] as Discipline[]).map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Standard Family</label>
            <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" value={standardFamily} onChange={(e) => setStandardFamily(e.target.value as StandardFamily)}>
              {(['NBR', 'SANS10400', 'SANS10160', 'SANS10100', 'SANS10162', 'SANS10142', 'SANS10252', 'MunicipalBylaw', 'NHBRC', 'ProfessionalCoordination', 'Other'] as StandardFamily[]).map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <Input placeholder="Standard part (e.g. Part T)" value={standardPart} onChange={(e) => setStandardPart(e.target.value)} />
          <Input placeholder="Municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} />
          <Input placeholder="Province" value={province} onChange={(e) => setProvince(e.target.value)} />
          <Input placeholder="Version" value={version} onChange={(e) => setVersion(e.target.value)} />
          <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          <Input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} />
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Disclaimer</label>
            <Input value={disclaimer} onChange={(e) => setDisclaimer(e.target.value)} />
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Tags</label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add tag and press Enter"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              className="flex-1"
            />
            <Button type="button" onClick={handleAddTag} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:bg-primary/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={resetForm}>
            Cancel
          </Button>
          <Button
            onClick={uploadMode === 'pdf' ? () => pdfFile && handlePdfUpload(pdfFile) : handleSubmit}
            disabled={isUploading || (uploadMode === 'manual' && (!title.trim() || !content.trim()))}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {uploadMode === 'pdf' ? 'Upload PDF' : 'Add Knowledge'}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
