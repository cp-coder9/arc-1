import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { Job, ArchitectProfile, UserProfile } from '@/types';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Star, Sparkles, User, ArrowRight, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { ArchitectPortfolio } from './ArchitectPortfolio';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';

interface ArchitectRecommendationsProps {
  job: Job;
}

export function ArchitectRecommendations({ job }: ArchitectRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<{ profile: ArchitectProfile, user: UserProfile }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArchitectId, setSelectedArchitectId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
  }, [job]);

  const fetchRecommendations = async () => {
    setIsLoading(true);
    try {
      const profilesSnap = await getDocs(collection(db, 'architect_profiles'));
      const allProfiles = profilesSnap.docs.map(d => d.data() as ArchitectProfile);

      const jobKeywords = [
        (job.category || '').toLowerCase(),
        ...(job.requirements || []).map(r => r.toLowerCase()),
        ...(job.title || '').toLowerCase().split(' '),
        ...(job.description || '').toLowerCase().split(' ')
      ];

      const scoredProfiles = allProfiles.map(profile => {
        let score = 0;
        const specs = (profile.specializations || []).map(s => s.toLowerCase());

        // Match category
        if (specs.includes((job.category || '').toLowerCase())) {
          score += 10;
        }

        // Match requirements and keywords
        jobKeywords.forEach(keyword => {
          if (!keyword || keyword.length < 3) return;
          if (specs.some(spec => spec.includes(keyword) || keyword.includes(spec))) {
            score += 3;
          }
        });

        // Experience bonus
        if (profile.yearsExperience) {
          score += Math.min(profile.yearsExperience, 10);
        }

        // Rating bonus
        score += (profile.averageRating || 0) * 2;

        return { profile, score };
      });

      const top3 = scoredProfiles
        .filter(p => p.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const results = await Promise.all(top3.map(async ({ profile }) => {
        const userDoc = await getDoc(doc(db, 'users', profile.userId));
        return {
          profile,
          user: userDoc.data() as UserProfile
        };
      }));

      setRecommendations(results.filter(r => r.user) as { profile: ArchitectProfile, user: UserProfile }[]);
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground animate-pulse">Analyzing architect skills for matching...</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="p-8 text-center border-2 border-dashed border-border rounded-[2rem] bg-secondary/5">
        <p className="text-sm text-muted-foreground italic">No specialized matches found yet. We'll notify you as more architects join.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
          <Sparkles size={14} />
        </div>
        <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">AI Recommended Experts</h4>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {recommendations.map(({ profile, user }) => (
          <Card key={user.uid} className="border-border shadow-sm hover:shadow-md transition-all overflow-hidden bg-white hover:border-primary/30 rounded-2xl group">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 border border-border">
                  <AvatarFallback className="bg-primary/5 text-primary font-bold">
                    {user.displayName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
<div className="flex items-center gap-1.5 min-w-0">
  <h5 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{user.displayName}</h5>
  {profile.sacapStatus === 'verified' ? (
    <>
      <div className="flex items-center justify-center w-4 h-4 bg-green-500 rounded-full text-white shrink-0" title="SACAP Verified">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L8.5 12.086l6.793-6.793a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
      {profile.sacapRegistrationType && (
        <span className="text-[9px] text-green-700 font-medium bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200 truncate max-w-[120px]">
          {profile.sacapRegistrationType}
        </span>
      )}
    </>
  ) : profile.sacapStatus === 'failed' ? (
    <ShieldX size={14} className="text-destructive shrink-0" title="SACAP Unverified" />
  ) : null}
</div>
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star size={12} fill="currentColor" />
                      <span className="text-xs font-bold text-foreground">{profile.averageRating || 'N/A'}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mb-2">
                    {profile.yearsExperience || 0} Years Experience • {profile.completedJobs || 0} Jobs
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(profile.specializations || []).slice(0, 3).map(spec => (
                      <Badge key={spec} variant="secondary" className="text-[8px] h-4 px-1.5 bg-primary/5 text-primary border-primary/10">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl text-[10px] font-bold uppercase tracking-widest border-primary/20 hover:bg-primary hover:text-primary-foreground shrink-0"
                  onClick={() => setSelectedArchitectId(user.uid)}
                >
                  View Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedArchitectId} onOpenChange={() => setSelectedArchitectId(null)}>
        <DialogContent className="sm:max-w-[900px] max-w-4xl border-border bg-white rounded-[2.5rem] p-0 overflow-hidden flex flex-col h-[90vh] shadow-2xl">
          <div className="bg-primary/5 p-8 border-b border-border shrink-0">
            <DialogHeader>
              <div className="flex justify-between items-center">
                <DialogTitle className="font-heading text-3xl font-bold tracking-tighter">Architect Profile</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setSelectedArchitectId(null)} className="rounded-full">
                  <span className="sr-only">Close</span>
                  <ArrowRight className="rotate-180" />
                </Button>
              </div>
            </DialogHeader>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-8">
              {selectedArchitectId && <ArchitectPortfolio architectId={selectedArchitectId} />}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
