import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, getDoc, orderBy } from 'firebase/firestore';
import { Review } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Star, CheckCircle, XCircle, Trash2, Clock, User, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { notificationService } from '@/services/notificationService';

export default function ReviewManagement() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleApprove = async (review: Review) => {
    try {
      await updateDoc(doc(db, 'reviews', review.id), { status: 'approved' });

      const userRef = doc(db, 'users', review.toId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentTotalReviews = userData.totalReviews || 0;
        const currentAverageRating = userData.averageRating || 0;

        const newTotalReviews = currentTotalReviews + 1;
        const newAverageRating = ((currentAverageRating * currentTotalReviews) + review.rating) / newTotalReviews;

        await updateDoc(userRef, {
          totalReviews: newTotalReviews,
          averageRating: Number(newAverageRating.toFixed(1))
        });
      }
      // Notify reviewer that their review was approved
      try {
        await notificationService.sendNotification(
          review.fromId,
          'message',
          'Your review has been approved and is now visible.',
          { jobId: review.jobId }
        );
      } catch (notifErr) {
        console.error('Failed to send approval notification:', notifErr);
      }
      toast.success("Review approved!");
    } catch (error) {
      toast.error("Failed to approve review.");
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm("Are you sure you want to delete this review?")) return;
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      toast.success("Review deleted.");
    } catch (error) {
      toast.error("Failed to delete review.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-heading font-bold">Review Management</h2>
        <Badge variant="outline" className="rounded-full px-4">{reviews.length} Total</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {reviews.map(review => (
          <Card key={review.id} className="border-border shadow-sm bg-white overflow-hidden rounded-2xl">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex text-yellow-400">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} size={16} fill={i < review.rating ? "currentColor" : "none"} />
                      ))}
                    </div>
                    <Badge variant={review.status === 'approved' ? 'default' : 'secondary'}>
                      {review.status}
                    </Badge>
                  </div>
                  <div className="bg-secondary/20 p-4 rounded-xl border border-border">
                    <p className="text-sm italic text-foreground flex items-start gap-2">
                      <MessageSquare size={14} className="mt-1 text-muted-foreground shrink-0" />
                      "{review.comment}"
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <User size={12} className="text-primary" /> To: {review.toId}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-primary" /> {new Date(review.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex md:flex-col gap-2 justify-center">
                  {review.status === 'pending_admin' && (
                    <Button onClick={() => handleApprove(review)} className="bg-green-600 hover:bg-green-700 text-white gap-2 rounded-xl" size="sm">
                      <CheckCircle size={16} /> Approve
                    </Button>
                  )}
                  <Button onClick={() => handleDelete(review.id)} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-2 rounded-xl" size="sm">
                    <Trash2 size={16} /> Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
