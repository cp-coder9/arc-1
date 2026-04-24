import React, { useState, useEffect } from 'react';
import { UserProfile, ArchitectProfile, JobCategory } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { User, Settings, Save, Loader2, Plus, Trash2, Image as ImageIcon, ShieldCheck, ShieldAlert, Search, CheckCircle } from 'lucide-react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { uploadAndTrackFile } from '../lib/uploadService';

interface ProfileEditorProps {
  user: UserProfile;
  trigger?: React.ReactElement;
  isAdminEditing?: boolean;
}

export default function ProfileEditor({ user, trigger, isAdminEditing = false }: ProfileEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Base User fields
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [bio, setBio] = useState(user.bio || '');

  // Architect specific fields
  const [architectProfile, setArchitectProfile] = useState<ArchitectProfile | null>(null);
  const [sacapNumber, setSacapNumber] = useState('');
  const [yearsExperience, setYearsExperience] = useState<number | ''>('');
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [newSpecialization, setNewSpecialization] = useState('');
  const [portfolioImages, setPortfolioImages] = useState<{ url: string; title: string; description?: string }[]>([]);
  const [website, setWebsite] = useState('');
  const [linkedIn, setLinkedIn] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const isArchitect = user.role === 'architect';

  useEffect(() => {
    if (isOpen && isArchitect) {
      loadArchitectProfile();
    }
  }, [isOpen, isArchitect]);

  const loadArchitectProfile = async () => {
    setIsLoadingProfile(true);
    try {
      const profileDoc = await getDoc(doc(db, 'architect_profiles', user.uid));
      if (profileDoc.exists()) {
        const data = profileDoc.data() as ArchitectProfile;
        setArchitectProfile(data);
        setSacapNumber(data.sacapNumber || '');
        setYearsExperience(data.yearsExperience || '');
        setSpecializations(data.specializations || []);
        setPortfolioImages(data.portfolioImages || []);
        setWebsite(data.website || '');
        setLinkedIn(data.linkedIn || '');
      }
    } catch (error) {
      console.error('Error loading architect profile:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleVerifySACAP = async () => {
    if (!sacapNumber.trim()) {
      toast.error('Please enter your SACAP number first');
      return;
    }

    setIsVerifying(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/architect/verify-sacap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          architectId: user.uid,
          name: displayName,
          sacapNumber: sacapNumber,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.status === 'verified') {
          toast.success('SACAP Verification Successful!');
        } else {
          toast.error('SACAP Verification Failed: Architect not found in registry');
        }
        loadArchitectProfile(); // Reload to get updated status
      } else {
        throw new Error(data.error || 'Verification failed');
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast.error('Failed to run autonomous SACAP verification');
    } finally {
      setIsVerifying(false);
    }
  };

const handleSave = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSaving(true);

  try {
    // Update User profile
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      displayName,
      bio,
      updatedAt: new Date().toISOString(),
    });

    // Update Architect profile if applicable
    if (isArchitect) {
      const archProfileRef = doc(db, 'architect_profiles', user.uid);
      const archData: Partial<ArchitectProfile> = {
        userId: user.uid,
        sacapNumber,
        ...(yearsExperience !== '' && { yearsExperience: Number(yearsExperience) }),
        specializations,
        portfolioImages,
        website,
        linkedIn,
        updatedAt: new Date().toISOString(),
      };

      // Auto-verify SACAP if number is provided and not already verified
      if (sacapNumber && architectProfile?.sacapStatus !== 'verified') {
        toast.info('Verifying SACAP registration...');
        try {
          // Call server-side API for SACAP verification
          const idToken = await auth.currentUser?.getIdToken();
          const response = await fetch('/api/architect/verify-sacap', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              architectId: user.uid,
              name: displayName,
              sacapNumber: sacapNumber,
            }),
          });
          
          const data = await response.json();
          if (data.success && data.status === 'verified') {
            archData.sacapStatus = 'verified';
            archData.sacapLastVerifiedAt = new Date().toISOString();
            archData.sacapRegistrationType = data.details?.category;
            toast.success(`SACAP verified: ${data.details?.category}`);
          } else {
            archData.sacapStatus = 'failed';
            toast.info('SACAP verification: Not found in registry');
          }
        } catch (error) {
          console.error('SACAP verification error:', error);
          archData.sacapStatus = 'failed';
        }
      }

      const profileDoc = await getDoc(archProfileRef);
      if (profileDoc.exists()) {
        await updateDoc(archProfileRef, archData);
      } else {
        // Initialize missing fields for new profiles
        await setDoc(archProfileRef, {
          ...archData,
          completedJobs: 0,
          averageRating: 0,
          totalReviews: 0,
        });
      }
    }

    toast.success('Profile updated successfully');
    setIsOpen(false);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    toast.error('Failed to update profile');
  } finally {
    setIsSaving(false);
  }
};

  const addSpecialization = () => {
    if (newSpecialization.trim() && !specializations.includes(newSpecialization.trim())) {
      setSpecializations([...specializations, newSpecialization.trim()]);
      setNewSpecialization('');
    }
  };

  const removeSpecialization = (spec: string) => {
    setSpecializations(specializations.filter(s => s !== spec));
  };

  const handleAddPortfolioImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.info('Uploading image...');
      const url = await uploadAndTrackFile(file, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploadedBy: user.uid,
        context: 'submission', // Using submission context for general uploads
      });

      setPortfolioImages([...portfolioImages, { url, title: file.name.split('.')[0] }]);
      toast.success('Image added to portfolio');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    }
  };

  const removePortfolioImage = (index: number) => {
    setPortfolioImages(portfolioImages.filter((_, i) => i !== index));
  };

  const updatePortfolioImageTitle = (index: number, title: string) => {
    const updated = [...portfolioImages];
    updated[index].title = title;
    setPortfolioImages(updated);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          trigger || (
            <Button variant="outline" size="sm" className="gap-2 rounded-full border-primary/20 text-primary hover:bg-primary/5">
              <Settings size={14} />
              {isAdminEditing ? 'Manage User' : 'Edit Profile'}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-[700px] border-border bg-white rounded-[2rem] p-0 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="bg-primary/5 p-8 border-b border-border shrink-0">
          <DialogHeader>
            <DialogTitle className="font-heading text-3xl font-bold tracking-tight">
              {isAdminEditing ? `Managing ${user.displayName}` : 'Edit Profile'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-base mt-2">
              Update {isAdminEditing ? 'this user\'s' : 'your'} professional profile and expertise.
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="flex-1">
          <form onSubmit={handleSave} className="p-8 space-y-8">
            <div className="flex justify-center">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-primary border-4 border-white shadow-xl overflow-hidden">
                  <User size={48} />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Name</label>
                  <Input
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Full name"
                    className="h-12 rounded-xl border-border focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Account Email</p>
                  <p className="text-sm font-mono h-12 flex items-center px-4 bg-secondary/30 rounded-xl border border-border text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bio / Professional Summary</label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about your experience..."
                  className="min-h-[100px] rounded-xl border-border focus:ring-2 focus:ring-primary/20 leading-relaxed"
                />
              </div>

              {isArchitect && (
                <div className="space-y-8 pt-4 border-t border-border">
                  <h3 className="font-heading text-xl font-bold text-primary">Architect Credentials</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SACAP Registration Number</label>
                      <div className="flex gap-2">
                        <Input
                          value={sacapNumber}
                          onChange={(e) => setSacapNumber(e.target.value)}
                          placeholder="e.g. ST1234"
                          className="h-12 rounded-xl border-border flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-12 rounded-xl px-4 gap-2 border-primary/20 text-primary"
                          onClick={handleVerifySACAP}
                          disabled={isVerifying}
                        >
                          {isVerifying ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                          Verify
                        </Button>
</div>
{architectProfile?.sacapStatus === 'verified' ? (
  <div className="flex items-center gap-2 mt-2">
    <div className="flex items-center gap-1 bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-1 text-xs font-medium">
      <div className="flex items-center justify-center w-4 h-4 bg-green-500 rounded-full text-white">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L8.5 12.086l6.793-6.793a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
      <span>SACAP Verified</span>
    </div>
    {architectProfile.sacapRegistrationType && (
      <Badge className="bg-blue-50 text-blue-700 border-blue-100 gap-1 text-[10px] px-2 py-0.5">
        {architectProfile.sacapRegistrationType}
      </Badge>
    )}
  </div>
) : architectProfile?.sacapStatus === 'failed' ? (
  <p className="text-[10px] text-destructive font-bold flex items-center gap-1 mt-1">
    <ShieldAlert size={12} /> Unverified / Not Found
  </p>
) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Years of Experience</label>
                      <Input
                        type="number"
                        value={yearsExperience}
                        onChange={(e) => setYearsExperience(e.target.value ? Number(e.target.value) : '')}
                        placeholder="5"
                        className="h-12 rounded-xl border-border"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Specializations & Skills</label>
                    <div className="flex gap-2">
                      <Input
                        value={newSpecialization}
                        onChange={(e) => setNewSpecialization(e.target.value)}
                        placeholder="e.g. Planning, Submission, 3D Rendering"
                        className="h-12 rounded-xl border-border"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSpecialization())}
                      />
                      <Button type="button" onClick={addSpecialization} className="h-12 rounded-xl px-6">Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {specializations.map((spec) => (
                        <Badge key={spec} variant="secondary" className="pl-3 pr-1 py-1 h-8 rounded-full gap-1 bg-primary/5 text-primary border-primary/10">
                          {spec}
                          <button type="button" onClick={() => removeSpecialization(spec)} className="hover:bg-primary/10 rounded-full p-0.5">
                            <Trash2 size={12} />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">Add skills like "Planning", "Submission", "Interior Design", etc. for better job matching.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Website</label>
                      <Input
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://yourportfolio.com"
                        className="h-12 rounded-xl border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">LinkedIn</label>
                      <Input
                        value={linkedIn}
                        onChange={(e) => setLinkedIn(e.target.value)}
                        placeholder="https://linkedin.com/in/yourprofile"
                        className="h-12 rounded-xl border-border"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Portfolio Gallery</label>
                      <Button type="button" variant="outline" size="sm" className="rounded-full h-8 gap-2 border-primary/20" onClick={() => document.getElementById('portfolio-upload')?.click()}>
                        <Plus size={14} /> Add Image
                      </Button>
                      <input id="portfolio-upload" type="file" accept="image/*" className="hidden" onChange={handleAddPortfolioImage} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {portfolioImages.map((img, idx) => (
                        <div key={idx} className="bg-secondary/20 p-4 rounded-2xl border border-border flex gap-4">
                          <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 border border-border">
                            <img src={img.url} alt={img.title} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Input
                              value={img.title}
                              onChange={(e) => updatePortfolioImageTitle(idx, e.target.value)}
                              placeholder="Project Title"
                              className="h-8 text-xs rounded-lg"
                            />
                            <Button type="button" variant="ghost" size="sm" onClick={() => removePortfolioImage(idx)} className="h-6 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 px-2 rounded-md">
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4 shrink-0">
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
                disabled={isSaving || isLoadingProfile}
                className="flex-1 h-14 rounded-xl font-bold gap-2 shadow-lg shadow-primary/20"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save Changes
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
