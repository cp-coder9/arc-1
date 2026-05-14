import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Star, MessageSquare, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { Review } from '@/types';

interface RatingSystemProps {
  fromId: string;
  toId: string;
  toName: string;
  jobId: string;
  type: Review['type'];
  onSuccess?: () => void;
}

export default function RatingSystem({ fromId, toId, toName, jobId, type, onSuccess }: RatingSystemProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a star rating.");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'reviews'), {
        fromId,
        toId,
        jobId,
        rating,
        comment,
        status: 'pending_admin',
        type,
        createdAt: new Date().toISOString()
      });

      toast.success("Review submitted! It will appear on the profile after admin review.");
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error submitting review:", error);
      toast.error("Failed to submit review.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-lg bg-white overflow-hidden rounded-3xl">
      <CardHeader className="bg-secondary/20 p-6 border-b border-border">
        <CardTitle className="text-xl font-heading font-bold">Rate {toName}</CardTitle>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Select Rating</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={`transition-all duration-200 transform ${
                  (hover || rating) >= star ? 'text-yellow-400 scale-125' : 'text-gray-200 hover:text-yellow-200'
                }`}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
              >
                <Star size={32} fill={(hover || rating) >= star ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <MessageSquare size={14} /> Your Feedback
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience working with this professional..."
            className="w-full p-4 rounded-2xl border border-border bg-white text-sm min-h-[120px] focus:ring-2 focus:ring-primary outline-none transition-all"
          />
        </div>

        <Button
          onClick={handleSubmit}
          className="w-full h-14 rounded-2xl font-bold text-lg shadow-lg shadow-primary/20 group"
          disabled={isSubmitting || rating === 0}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Review'}
          <Send className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </CardContent>
    </Card>
  );
}
