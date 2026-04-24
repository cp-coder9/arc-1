import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, deleteDoc, doc, orderBy } from 'firebase/firestore';

import { UserProfile, UploadedFile } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { badgeVariants } from './ui/badge';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { 
  File, 
  FileText, 
  Image as ImageIcon, 
  FileCode, 
  Download, 
  Trash2, 
  Search, 
  Filter, 
  Clock, 
  User, 
  ExternalLink,
  Loader2,
  FileArchive,
  HardDrive
} from 'lucide-react';
import { safeFormat, cn } from '@/lib/utils';

interface FileManagerProps {
  user: UserProfile;
}

export default function FileManager({ user }: FileManagerProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const q = user.role === 'admin'
      ? query(collection(db, 'uploaded_files'), orderBy('uploadedAt', 'desc'))
      : query(
          collection(db, 'uploaded_files'), 
          where('uploadedBy', '==', user.uid),
          orderBy('uploadedAt', 'desc')
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFiles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UploadedFile)));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching files:", error);
      toast.error("Failed to load files");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid, user.role]);

  const handleDelete = async (file: UploadedFile) => {
    if (!confirm(`Are you sure you want to delete ${file.fileName}?`)) return;
    
    setDeletingId(file.id);
    try {
      // 1. Get Firebase ID token for authorization
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      // 2. Call secure server-side delete endpoint
      const response = await fetch('/api/files/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          fileId: file.id,
          fileUrl: file.url
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete file");
      }
      
      toast.success("File deleted successfully");
    } catch (error: any) {
      console.error("Error deleting file:", error);
      toast.error(error.message || "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-6 h-6 text-blue-500" />;
    if (type === 'application/pdf') return <FileText className="w-6 h-6 text-red-500" />;
    if (type === 'application/dwg' || type === 'application/dxf') return <FileCode className="w-6 h-6 text-green-500" />;
    if (type.includes('zip') || type.includes('rar')) return <FileArchive className="w-6 h-6 text-orange-500" />;
    if (type.includes('json') || type.includes('javascript') || type.includes('typescript')) return <FileCode className="w-6 h-6 text-purple-500" />;
    return <File className="w-6 h-6 text-slate-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter(f => 
    f.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.context.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[2rem] border border-border shadow-sm">
        <div>
          <h2 className="text-3xl font-heading font-bold tracking-tight flex items-center gap-3">
            <HardDrive className="text-primary w-8 h-8" />
            File Management
          </h2>
          <p className="text-muted-foreground mt-1">
            {user.role === 'admin' 
              ? 'Oversee all architectural assets across the platform.' 
              : 'Digital archive of all your project uploads and documents.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search files..." 
              className="pl-10 h-10 rounded-full border-border bg-secondary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredFiles.map((file) => (
          <Card key={file.id} className="group overflow-hidden rounded-[1.5rem] border-border hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white">
            <div className="aspect-video bg-secondary/30 flex items-center justify-center relative group-hover:bg-secondary/10 transition-colors">
              {file.fileType.startsWith('image/') ? (
                <img 
                  src={file.url} 
                  alt={file.fileName} 
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="p-6 bg-white rounded-2xl shadow-sm border border-border">
                  {getFileIcon(file.fileType)}
                </div>
              )}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-sm"
                  onClick={() => window.open(file.url, '_blank')}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="w-8 h-8 rounded-full shadow-sm"
                  onClick={() => handleDelete(file)}
                  disabled={deletingId === file.id}
                >
                  {deletingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
              <div className="absolute bottom-3 left-3">
                <div className={cn(
                  badgeVariants({ variant: 'outline' }),
                  "bg-white/90 backdrop-blur-sm border-none shadow-sm text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                )}>
                  {file.context}
                </div>
              </div>
            </div>
            <CardContent className="p-5">
              <div className="flex flex-col gap-1 mb-3">
                <h4 className="font-bold text-sm truncate" title={file.fileName}>{file.fileName}</h4>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="font-medium">{formatSize(file.fileSize)}</span>
                  <span>•</span>
                  <span>{file.fileType?.split('/')?.[1]?.toUpperCase() || 'FILE'}</span>
                </div>
              </div>
              
              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {safeFormat(file.uploadedAt, 'MMM d, yyyy')}
                </div>
                {user.role === 'admin' && (
                  <div className="flex items-center gap-1 text-[8px] font-bold text-primary uppercase tracking-tighter">
                    <User className="w-2.5 h-2.5" />
                    {(file.uploadedBy || '').substring(0, 6)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredFiles.length === 0 && (
          <div className="col-span-full py-20 bg-secondary/10 rounded-[2rem] border-2 border-dashed border-border flex flex-col items-center justify-center gap-4 text-center">
            <div className="p-4 bg-white rounded-full shadow-sm">
              <HardDrive className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">No files found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search or upload new documents.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
