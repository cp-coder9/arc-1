/**
 * Architect Portfolio Component
 * Public profile with portfolio gallery and reviews
 */

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, Award, Briefcase, Calendar, Link as LinkIcon, MapPin, ShieldCheck, ShieldX } from 'lucide-react';
import { ArchitectProfile, Review, UserProfile } from '@/types';
import { format } from 'date-fns';

interface ArchitectPortfolioProps {
  architectId: string;
}

export function ArchitectPortfolio({ architectId }: ArchitectPortfolioProps) {
  const [profile, setProfile] = useState<ArchitectProfile | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPortfolio();
  }, [architectId]);

  const loadPortfolio = async () => {
    try {
      setIsLoading(true);
      
      // Load user profile
      const userDoc = await getDoc(doc(db, 'users', architectId));
      if (userDoc.exists()) {
        setUser(userDoc.data() as UserProfile);
      }

      // Load architect profile
      const profileDoc = await getDoc(doc(db, 'architect_profiles', architectId));
      if (profileDoc.exists()) {
        setProfile(profileDoc.data() as ArchitectProfile);
      }

      // Load reviews
      const reviewsQuery = query(
        collection(db, 'reviews'),
        where('toId', '==', architectId),
        where('type', '==', 'client_to_architect')
      );
      const reviewsSnap = await getDocs(reviewsQuery);
      setReviews(reviewsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review)));
    } catch (error) {
      console.error('Failed to load portfolio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateAverageRating = () => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
  };

  const getRatingDistribution = () => {
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(review => {
      distribution[review.rating as keyof typeof distribution]++;
    });
    return distribution;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading profile...</div>;
  }

  if (!user) {
    return <div className="text-center py-8">Architect not found</div>;
  }

  const ratingDist = getRatingDistribution();
  const avgRating = calculateAverageRating();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {user.displayName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{user.displayName}</h1>
                {profile?.sacapNumber && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Award className="h-3 w-3" />
                      SACAP: {profile.sacapNumber}
                    </Badge>
                    {profile.sacapStatus === 'verified' ? (
                      <Badge className="bg-green-50 text-green-700 border-green-100 gap-1 text-[10px] px-2 py-0.5">
                        <ShieldCheck size={12} /> SACAP Verified
                      </Badge>
                    ) : profile.sacapStatus === 'failed' ? (
                      <Badge variant="destructive" className="gap-1 text-[10px] px-2 py-0.5">
                        <ShieldX size={12} /> SACAP Unverified
                      </Badge>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="text-muted-foreground mb-4">{user.bio || 'No bio available'}</p>
              
              <div className="flex flex-wrap gap-4 text-sm">
                {profile?.yearsExperience && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {profile.yearsExperience} years experience
                  </div>
                )}
                {profile?.completedJobs && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    {profile.completedJobs} completed jobs
                  </div>
                )}
                {profile?.website && (
                  <a 
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <LinkIcon className="h-4 w-4" />
                    Website
                  </a>
                )}
              </div>
            </div>
            
            {/* Rating Summary */}
            <div className="md:text-right">
              <div className="flex items-center gap-2 md:justify-end mb-1">
                <span className="text-4xl font-bold">{avgRating}</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-5 w-5 ${
                        star <= Math.round(Number(avgRating))
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Specializations */}
          {profile?.specializations && profile.specializations.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="text-sm font-semibold mb-2">Specializations</h3>
              <div className="flex flex-wrap gap-2">
                {profile.specializations.map((spec) => (
                  <Badge key={spec} variant="outline">{spec}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="portfolio">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-6">
          {profile?.portfolioImages && profile.portfolioImages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profile.portfolioImages.map((image, index) => (
                <Card key={index} className="overflow-hidden group cursor-pointer">
                  <div className="aspect-video relative">
                    <img
                      src={image.url}
                      alt={image.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold">{image.title}</h3>
                    {image.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {image.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No portfolio items yet</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          {/* Rating Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rating Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = ratingDist[rating as keyof typeof ratingDist];
                  const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                  return (
                    <div key={rating} className="flex items-center gap-3">
                      <div className="flex items-center gap-1 w-12">
                        <span>{rating}</span>
                        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                      </div>
                      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-sm text-muted-foreground">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Reviews List */}
          <div className="space-y-4">
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <Card key={review.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {review.fromId[0]}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= review.rating
                                    ? 'text-yellow-400 fill-yellow-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(review.createdAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <p className="text-sm">{review.comment}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Star className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No reviews yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
