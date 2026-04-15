/**
 * SACAP Verification Component
 * For architect verification workflow
 */

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { toast } from 'sonner';
import { ArchitectVerification, UserProfile, VerificationStatus } from '@/types';

interface SACAPVerificationProps {
  user: UserProfile;
}

export function SACAPVerification({ user }: SACAPVerificationProps) {
  const [verification, setVerification] = useState<ArchitectVerification | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [sacapNumber, setSacapNumber] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);

  useEffect(() => {
    loadVerification();
  }, [user.uid]);

  const loadVerification = async () => {
    try {
      const docRef = doc(db, 'architect_verifications', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setVerification(docSnap.data() as ArchitectVerification);
      }
    } catch (error) {
      console.error('Failed to load verification:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      if (!file.type.match(/pdf|image/)) {
        toast.error('Only PDF or image files are allowed');
        return;
      }
      setCertificateFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!sacapNumber.trim()) {
      toast.error('Please enter your SACAP registration number');
      return;
    }
    if (!certificateFile) {
      toast.error('Please upload your SACAP certificate');
      return;
    }

    setIsUploading(true);
    try {
      // Upload certificate
      const url = await uploadAndTrackFile(certificateFile, {
        fileName: certificateFile.name,
        fileType: certificateFile.type,
        fileSize: certificateFile.size,
        uploadedBy: user.uid,
        context: 'certificate',
        token: import.meta.env.VITE_BLOB_READ_WRITE_TOKEN
      });

      // Create verification record
      const verificationData: ArchitectVerification = {
        userId: user.uid,
        status: 'pending',
        certificateUrl: url,
        sacapNumber: sacapNumber.trim(),
        submittedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'architect_verifications', user.uid), verificationData);
      setVerification(verificationData);
      toast.success('Verification submitted successfully! We will review your documents shortly.');
    } catch (error) {
      console.error('Failed to submit verification:', error);
      toast.error('Failed to submit verification');
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusBadge = (status: VerificationStatus) => {
    const configs = {
      pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800', label: 'Pending Review' },
      verified: { icon: CheckCircle, color: 'bg-green-100 text-green-800', label: 'Verified' },
      rejected: { icon: XCircle, color: 'bg-red-100 text-red-800', label: 'Rejected' },
      expired: { icon: Clock, color: 'bg-gray-100 text-gray-800', label: 'Expired' },
    };
    const config = configs[status];
    return (
      <Badge className={`gap-1 ${config.color}`}>
        <config.icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              SACAP Verification
            </CardTitle>
            <CardDescription>
              Verify your SACAP registration to apply for jobs
            </CardDescription>
          </div>
          {verification && getStatusBadge(verification.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {verification?.status === 'verified' ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 text-green-800 mb-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Verification Complete</span>
              </div>
              <p className="text-sm text-green-700">
                Your SACAP registration ({verification.sacapNumber}) has been verified.
                You can now apply for jobs on the platform.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Verified on: {new Date(verification.lastVerifiedAt || verification.submittedAt).toLocaleDateString()}</p>
              {verification.expiresAt && (
                <p>Expires: {new Date(verification.expiresAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        ) : verification?.status === 'pending' ? (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center gap-2 text-yellow-800 mb-2">
                <Clock className="h-5 w-5" />
                <span className="font-semibold">Under Review</span>
              </div>
              <p className="text-sm text-yellow-700">
                Your verification request (SACAP: {verification.sacapNumber}) is being reviewed by our team.
                This usually takes 1-2 business days.
              </p>
            </div>
          </div>
        ) : verification?.status === 'rejected' ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 text-red-800 mb-2">
                <XCircle className="h-5 w-5" />
                <span className="font-semibold">Verification Rejected</span>
              </div>
              <p className="text-sm text-red-700 mb-2">
                {verification.rejectionReason || 'Your verification was rejected. Please check your documents and try again.'}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">SACAP Registration Number</label>
                <Input
                  placeholder="e.g., SACAP-12345"
                  value={sacapNumber}
                  onChange={(e) => setSacapNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Upload SACAP Certificate</label>
                <div className="border-2 border-dashed border-input rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="certificate"
                  />
                  <label htmlFor="certificate" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {certificateFile ? certificateFile.name : 'Click to upload certificate'}
                    </p>
                  </label>
                </div>
              </div>
              <Button 
                onClick={handleSubmit} 
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? 'Uploading...' : 'Resubmit Verification'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-700">
                SACAP registration verification is required to apply for jobs on Architex.
                Please upload your SACAP certificate and registration number.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">SACAP Registration Number</label>
              <Input
                placeholder="e.g., SACAP-12345"
                value={sacapNumber}
                onChange={(e) => setSacapNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Upload SACAP Certificate</label>
              <div className="border-2 border-dashed border-input rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="certificate"
                />
                <label htmlFor="certificate" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {certificateFile ? certificateFile.name : 'Click to upload certificate (PDF or Image)'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Max file size: 5MB</p>
                </label>
              </div>
            </div>
            <Button 
              onClick={handleSubmit} 
              disabled={isUploading}
              className="w-full"
            >
              {isUploading ? 'Uploading...' : 'Submit for Verification'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
