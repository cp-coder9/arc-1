import React, { useState } from 'react';
import { UserProfile } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { User, Settings, Save, Loader2 } from 'lucide-react';

interface ProfileEditorProps {
  user: UserProfile;
  trigger?: React.ReactElement;
}

export default function ProfileEditor({ user, trigger }: ProfileEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [bio, setBio] = useState(user.bio || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName,
        bio,
      });
      toast.success('Profile updated successfully');
      setIsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          trigger || (
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-primary/20 text-primary hover:bg-primary/5">
              <Settings size={14} />
              Edit Profile
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-[500px] border-border bg-white rounded-[2rem] p-0 overflow-hidden shadow-2xl">
        <div className="bg-primary/5 p-8 border-b border-border">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl font-bold tracking-tight">Edit Profile</DialogTitle>
            <DialogDescription className="text-muted-foreground text-base mt-2">
              Update your personal information and how others see you on the platform.
            </DialogDescription>
          </DialogHeader>
        </div>
        <form onSubmit={handleSave} className="p-8 space-y-8">
          <div className="flex justify-center">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-primary border-4 border-white shadow-xl">
                <User size={48} />
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                <span className="text-white text-[10px] font-bold uppercase tracking-widest">Change</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Name</label>
              <Input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                className="h-12 rounded-xl border-border focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bio / Professional Summary</label>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about your experience and expertise..."
                className="min-h-[120px] rounded-xl border-border focus:ring-2 focus:ring-primary/20 leading-relaxed"
              />
            </div>

            <div className="p-4 bg-secondary/30 rounded-2xl border border-border">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Account Email</p>
              <p className="text-sm font-mono text-foreground">{user.email}</p>
              <p className="text-[10px] text-muted-foreground mt-2 italic">Email cannot be changed here.</p>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              className="flex-1 h-14 rounded-xl font-bold uppercase tracking-widest text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 h-14 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
