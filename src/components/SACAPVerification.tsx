/**
 * SACAP Verification Component
 * For architect verification workflow
 */

import React, { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { uploadAndTrackFile } from '@/lib/uploadService';
import { toast } from 'sonner';
import { UserProfile, UserVerification, VerificationStatus } from '@/types';

interface SACAPVerificationProps {
  user: UserProfile;
}

export function SACAPVerification({ user }: SACAPVerificationProps) {
  const [verification, setVerification] = useState<UserVerification | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [sacapNumber, setSacapNumber] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);

  useEffect(() => {
    loadVerification();
  }, [user.uid]);

  const loadVerification = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/verifications/me?subjectType=bep', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load verification status');
      const records = await res.json() as UserVerification[];
      const sacapRecord = records.find(record => record.statutoryBody === 'SACAP') || records[0];
      if (sacapRecord) setVerification(sacapRecord);
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
      });

      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('You must be signed in to submit verification');
      const response = await fetch('/api/verifications/submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectType: 'bep',
          statutoryBody: 'SACAP',
          registrationNumber: sacapNumber.trim(),
          evidenceUrls: [url],
          displayName: user.displayName,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to submit verification');
      }
      const verificationData = await response.json() as UserVerification;
      setVerification(verificationData);
      toast.success('Verification submitted. The Architex verification agent is checking the official SACAP register in the background.');
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
                Your SACAP registration ({verification.registrationNumber}) has been verified.
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
                Your verification request (SACAP: {verification.registrationNumber}) is being reviewed by our team.
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
