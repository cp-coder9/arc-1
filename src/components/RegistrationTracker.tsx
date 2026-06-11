import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import { ShieldCheck, AlertTriangle, Clock, CheckCircle2, RefreshCw, BookOpen } from 'lucide-react';
import type { UserProfile, ProfessionalRegistration } from '../types';
import { registrationRenewalService } from '../services/registrationRenewalService';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Props {
  user: UserProfile;
  firmId?: string;
}

const BODY_LABELS: Record<string, string> = {
  SACAP: 'SACAP',
  ECSA: 'ECSA',
  SACQSP: 'SACQSP',
  SACLAP: 'SACLAP',
  SACPCMP: 'SACPCMP',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-300',
  expiring_soon: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  expired: 'bg-red-100 text-red-800 border-red-300',
  renewed: 'bg-blue-100 text-blue-800 border-blue-300',
  suspended: 'bg-gray-100 text-gray-600 border-gray-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active: <CheckCircle2 size={16} className="text-green-600" />,
  expiring_soon: <AlertTriangle size={16} className="text-yellow-600" />,
  expired: <AlertTriangle size={16} className="text-red-600" />,
  renewed: <RefreshCw size={16} className="text-blue-600" />,
  suspended: <Clock size={16} className="text-gray-500" />,
};

export default function RegistrationTracker({ user, firmId }: Props) {
  const [registrations, setRegistrations] = useState<ProfessionalRegistration[]>([]);
  const activeFirmId = firmId || user.primaryFirmId || '';

  useEffect(() => {
    if (!activeFirmId) return;
    const unsub = registrationRenewalService.subscribeToRegistrations(activeFirmId, setRegistrations);
    return () => unsub();
  }, [activeFirmId]);

  const handleSendReminders = async () => {
    if (!activeFirmId) return;
    try {
      const sent = await registrationRenewalService.sendRenewalReminders(activeFirmId);
      toast.success(`Sent ${sent} renewal reminders.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send reminders.');
    }
  };

  const daysUntil = (dateStr: string) => {
    const now = new Date();
    const target = new Date(dateStr);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const expiringSoon = registrations.filter((r) => r.status === 'expiring_soon');
  const expired = registrations.filter((r) => r.status === 'expired');
  const active = registrations.filter((r) => r.status === 'active');

  return (
    <div className="space-y-6">
      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck size={24} className="text-primary" />
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase">Total</p>
              <p className="text-lg font-black">{registrations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 size={24} className="text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase">Active</p>
              <p className="text-lg font-black">{active.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle size={24} className="text-yellow-600" />
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase">Expiring Soon</p>
              <p className="text-lg font-black">{expiringSoon.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle size={24} className="text-red-600" />
            <div>
              <p className="text-xs text-muted-foreground font-bold uppercase">Expired</p>
              <p className="text-lg font-black">{expired.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Registration List */}
      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden">
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-sans text-2xl font-black flex items-center gap-3">
                <ShieldCheck size={22} className="text-primary" />
                Professional Registrations
              </CardTitle>
              <CardDescription>Track SACAP, ECSA, and other professional body registrations</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="rounded-full" onClick={handleSendReminders}>
              <RefreshCw size={14} className="mr-2" /> Send Reminders
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ScrollArea className="h-[400px]">
            {registrations.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheck size={48} className="mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">No registrations tracked</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeFirmId ? 'Add professional registrations to track renewals and CPD.' : 'Select a firm to view registrations.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {registrations.map((reg) => {
                  const days = daysUntil(reg.expiryDate);
                  return (
                    <div key={reg.id} className="flex items-center justify-between rounded-xl border border-border/50 bg-background p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          {STATUS_ICONS[reg.status] || <ShieldCheck size={16} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold">{BODY_LABELS[reg.body] || reg.body}</p>
                            <Badge className={`rounded-full text-[10px] ${STATUS_COLORS[reg.status] || 'bg-gray-100'}`}>
                              {reg.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Reg #: {reg.registrationNumber} &middot; Expires: {reg.expiryDate}
                            {days > 0 && days <= 365 && (
                              <span className={`ml-2 font-bold ${days <= 30 ? 'text-red-600' : days <= 90 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                                ({days} days)
                              </span>
                            )}
                            {days <= 0 && <span className="ml-2 font-bold text-red-600">(EXPIRED)</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {/* CPD Progress */}
                        {reg.cpdPointsRequired > 0 && (
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <BookOpen size={12} />
                              CPD: {reg.cpdPointsEarned}/{reg.cpdPointsRequired}
                            </div>
                            <div className="w-24 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${reg.cpdPointsEarned >= reg.cpdPointsRequired ? 'bg-green-500' : reg.cpdPointsEarned > 0 ? 'bg-yellow-500' : 'bg-red-300'}`}
                                style={{ width: `${Math.min(100, (reg.cpdPointsEarned / reg.cpdPointsRequired) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
