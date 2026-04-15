import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { updateProfile, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { User, Mail, Shield, AlertCircle, Loader2, Save, Key, UserCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';

interface UserSettingsProps {
  user: UserProfile;
}

export default function UserSettings({ user }: UserSettingsProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio || '');
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState(''); // For re-auth
  const [isSaving, setIsSaving] = useState(false);
  const [isReauthModalOpen, setIsReauthModalOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error('Not authenticated');

      // Update Auth Profile
      if (displayName !== firebaseUser.displayName) {
        await updateProfile(firebaseUser, { displayName });
      }

      // Update Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        bio,
        updatedAt: new Date().toISOString()
      });

      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmailUpdateClick = () => {
    if (email === user.email) return;
    setPendingEmail(email);
    setIsReauthModalOpen(true);
  };

  const handleReauthAndEmailUpdate = async () => {
    setIsSaving(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email) throw new Error('Not authenticated');

      const credential = EmailAuthProvider.credential(firebaseUser.email, password);
      await reauthenticateWithCredential(firebaseUser, credential);
      
      await updateEmail(firebaseUser, pendingEmail);
      await updateDoc(doc(db, 'users', user.uid), {
        email: pendingEmail,
        updatedAt: new Date().toISOString()
      });

      toast.success('Email updated successfully');
      setIsReauthModalOpen(false);
      setPassword('');
    } catch (error: any) {
      console.error('Email update error:', error);
      toast.error(error.message || 'Failed to update email. Ensure password is correct.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="bg-white p-10 rounded-[2.5rem] border border-border">
        <div className="flex items-center gap-6 mb-8">
          <div className="w-20 h-20 rounded-3xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-3xl shadow-xl shadow-primary/20">
            {user.displayName[0]}
          </div>
          <div>
            <h1 className="text-4xl font-heading font-bold tracking-tight">Account Settings</h1>
            <p className="text-muted-foreground text-lg">Manage your personal information and security preferences.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="md:col-span-2 space-y-8">
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                  <User size={14} /> Full Name
                </label>
                <Input 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-14 rounded-2xl bg-secondary/30 border-none px-6 focus:ring-2 focus:ring-primary/50"
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
                  <UserCircle size={14} /> Professional Bio
                </label>
                <Textarea 
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="min-h-[150px] rounded-2xl bg-secondary/30 border-none p-6 focus:ring-2 focus:ring-primary/50 text-base"
                  placeholder="Tell clients or architects about yourself..."
                />
              </div>

              <Button 
                type="submit" 
                disabled={isSaving}
                className="rounded-full px-10 h-14 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              >
                {isSaving ? <Loader2 className="mr-2 animate-spin" /> : <Save className="mr-2" />}
                Save Changes
              </Button>
            </form>

            <div className="pt-10 border-t border-border space-y-6">
              <h3 className="text-2xl font-heading font-bold flex items-center gap-3">
                <Mail className="text-primary w-6 h-6" /> Security & Email
              </h3>
              
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Email Address</label>
                <div className="flex gap-4">
                  <Input 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 rounded-2xl bg-secondary/30 border-none px-6 focus:ring-2 focus:ring-primary/50 flex-1"
                  />
                  <Button 
                    variant="outline" 
                    onClick={handleEmailUpdateClick}
                    disabled={email === user.email || isSaving}
                    className="h-14 rounded-2xl px-6 font-bold border-primary/20 hover:bg-primary/5"
                  >
                    Update Email
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                  <Shield size={12} className="text-green-500" /> 
                  Changing your email requires re-authentication for security.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl border-border bg-secondary/10 shadow-none overflow-hidden">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="text-primary w-5 h-5" /> Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <DetailItem label="User ID" value={user.uid.slice(0, 8) + '...'} />
                <DetailItem label="Role" value={user.role.toUpperCase()} />
                <DetailItem label="Member Since" value={new Date(user.createdAt).toLocaleDateString()} />
              </CardContent>
            </Card>

            <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10">
              <h4 className="font-bold text-primary mb-2">Need Help?</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you're having trouble updating your information or have security concerns, contact our support team.
              </p>
              <Button variant="link" className="p-0 h-auto text-primary font-bold mt-4">support@architex.co.za</Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isReauthModalOpen} onOpenChange={setIsReauthModalOpen}>
        <DialogContent className="rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading font-bold">Verify Identity</DialogTitle>
            <DialogDescription>
              To change your email address to <strong>{pendingEmail}</strong>, please enter your current password.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Key className="w-8 h-8 text-primary" />
            </div>
            <div className="w-full space-y-2">
             <label className="text-xs uppercase tracking-widest font-bold text-muted-foreground text-left block">Account Password</label>
             <Input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-14 rounded-2xl bg-secondary/30 border-none px-6 focus:ring-2 focus:ring-primary/50 text-center text-xl tracking-widest"
                placeholder="••••••••"
             />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReauthModalOpen(false)} className="rounded-full px-8">Cancel</Button>
            <Button 
                onClick={handleReauthAndEmailUpdate} 
                disabled={isSaving || !password}
                className="rounded-full px-8 bg-black hover:bg-zinc-800 text-white font-bold"
            >
              {isSaving ? <Loader2 className="animate-spin mr-2" /> : 'Confirm Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}
