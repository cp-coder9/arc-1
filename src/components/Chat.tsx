import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, orderBy, doc, getDoc } from 'firebase/firestore';
import { Message, UserProfile, Job, UserRole } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Send, X, MessageCircle } from 'lucide-react';
import { safeFormat } from '../lib/utils';
import { toast } from 'sonner';

interface ChatProps {
  job: Job;
  currentUser: UserProfile;
  otherUser: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
}

export function Chat({ job, currentUser, otherUser, isOpen, onClose }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !otherUser) return;
    const q = query(
      collection(db, 'messages'),
      where('jobId', '==', job.id),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    });
    return () => unsub();
  }, [isOpen, job.id, otherUser?.uid]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !otherUser) return;
    try {
      await addDoc(collection(db, 'messages'), {
        jobId: job.id,
        senderId: currentUser.uid,
        senderRole: currentUser.role as any,
        content: newMessage,
        isRead: false,
        createdAt: new Date().toISOString()
      });
      setNewMessage('');
    } catch (error) {
      toast.error("Failed to send message");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
        <div className="bg-primary p-6 flex justify-between items-center text-primary-foreground">
           <div className="flex items-center gap-3">
              <Avatar className="bg-white/20">
                <AvatarFallback className="text-white">{otherUser?.displayName[0]}</AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-lg font-bold">{otherUser?.displayName}</DialogTitle>
                <p className="text-[10px] opacity-70 uppercase font-bold tracking-widest">{otherUser?.role}</p>
              </div>
           </div>
           <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-white/10 rounded-full"><X size={20} /></Button>
        </div>
        <ScrollArea className="flex-1 p-6 bg-secondary/10">
           <div className="space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${m.senderId === currentUser.uid ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-white border border-border rounded-tl-none shadow-sm'}`}>
                      <p>{m.content}</p>
                      <p className={`text-[8px] mt-2 opacity-50 ${m.senderId === currentUser.uid ? 'text-right' : 'text-left'}`}>
                        {safeFormat(m.createdAt, 'HH:mm')}
                      </p>
                   </div>
                </div>
              ))}
              <div ref={scrollRef} />
           </div>
        </ScrollArea>
        <form onSubmit={handleSend} className="p-4 bg-white border-t border-border flex gap-2">
           <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." className="rounded-xl" />
           <Button type="submit" size="icon" className="rounded-xl"><Send size={18} /></Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChatButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} size="icon" className="fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-2xl z-50">
      <MessageCircle size={24} />
    </Button>
  );
}
