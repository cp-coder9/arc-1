/**
 * Building Passport View — Digital Building Passport Display
 *
 * Displays the persistent building record with sections for:
 * building overview, compliance record, installed systems,
 * key contacts, and document archive.
 *
 * Requirements: 2.1, 2.2, 2.6
 */

import React from 'react';
import {
  Building2,
  MapPin,
  Calendar,
  Users,
  FileText,
  ShieldCheck,
  Cpu,
  Contact,
  Archive,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { UserProfile } from '@/types';
import type { BuildingPassport, FMBuildingRole } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BuildingPassportViewProps {
  user: UserProfile;
  buildingId: string;
  passport: BuildingPassport | null;
  userRole: FMBuildingRole | null;
  canModify: boolean;
  isReadOnly: boolean;
}

// ─── Mock Data Structures for Display ─────────────────────────────────────────

interface ComplianceCertificate {
  name: string;
  status: 'valid' | 'expiring' | 'expired';
  expiryDate: string;
}

interface InstalledSystem {
  name: string;
  category: string;
  make: string;
  model: string;
  installationDate: string;
  expectedServiceLife: string;
}

interface KeyContact {
  role: string;
  firmName: string;
  contactName: string;
  email: string;
  phone: string;
}

interface ArchivedDocument {
  name: string;
  type: string;
  uploadDate: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BuildingPassportView({
  user: _user,
  buildingId,
  passport,
  userRole,
  canModify: _canModify,
  isReadOnly,
}: BuildingPassportViewProps) {
  // TODO: Fetch compliance certificates from API
  const complianceCertificates: ComplianceCertificate[] = [];

  // TODO: Fetch installed systems from API
  const installedSystems: InstalledSystem[] = [];

  // TODO: Fetch key contacts from API
  const keyContacts: KeyContact[] = [];

  // TODO: Fetch archived documents from API
  const archivedDocuments: ArchivedDocument[] = [];

  if (!passport) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50 mt-4">
        <CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 text-surface-500 mx-auto mb-3" aria-hidden="true" />
          <p className="text-lg font-medium text-surface-300">No Building Passport</p>
          <p className="text-sm text-surface-500 mt-1">
            Building passport for ID {buildingId} has not been created yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Read-only banner */}
      {isReadOnly && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-sm text-amber-400">
          {passport.subscriptionStatus === 'lapsed'
            ? 'Subscription lapsed — data is preserved in read-only mode until renewed.'
            : 'You have read-only access to this building passport.'}
        </div>
      )}

      {/* Subscription status indicator (Requirement 2.6) */}
      {passport.subscriptionStatus !== 'lapsed' && (
        <div className="flex items-center gap-3 text-sm text-surface-400">
          <span className="text-xs uppercase tracking-wider text-surface-500">Subscription</span>
          <SubscriptionStatusIndicator
            planType={passport.subscriptionStatus}
            renewalDate={passport.subscriptionRenewalDate}
            holderId={passport.subscriptionHolderId}
          />
        </div>
      )}

      {/* Building Overview Section */}
      <SectionCard
        icon={<Building2 className="h-5 w-5 text-blue-400" />}
        title="Building Overview"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoField label="Building Name" value={passport.buildingName} />
          <InfoField label="Address" value={passport.physicalAddress} icon={<MapPin className="h-3.5 w-3.5" />} />
          <InfoField label="Construction Completed" value={formatDate(passport.constructionCompletionDate)} icon={<Calendar className="h-3.5 w-3.5" />} />
          <InfoField label="Building Type" value={passport.buildingType ?? '—'} />
          <InfoField label="Gross Floor Area" value={passport.grossFloorArea ? `${passport.grossFloorArea.toLocaleString()} m²` : '—'} />
          <InfoField label="Storeys" value={passport.numberOfStoreys?.toString() ?? '—'} />
          <InfoField label="Main Contractor" value={passport.mainContractorName} />
          <InfoField label="Principal Agent" value={passport.principalAgentName} />
          <InfoField label="Project Reference" value={passport.projectReferenceNumber} />
        </div>
      </SectionCard>

      {/* Compliance Record Section */}
      <SectionCard
        icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}
        title="Compliance Record"
      >
        {complianceCertificates.length === 0 ? (
          <EmptyState message="No compliance certificates recorded." />
        ) : (
          <div className="space-y-2">
            {complianceCertificates.map((cert, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-900/50"
              >
                <span className="text-sm text-surface-200">{cert.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-surface-400">Expires: {cert.expiryDate}</span>
                  <CertStatusBadge status={cert.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Installed Systems Section */}
      <SectionCard
        icon={<Cpu className="h-5 w-5 text-purple-400" />}
        title="Installed Systems"
      >
        {installedSystems.length === 0 ? (
          <EmptyState message="No installed systems registered." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {installedSystems.map((system, i) => (
              <div
                key={i}
                className="rounded-md bg-surface-900/50 px-3 py-2 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-surface-200">{system.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {system.category}
                  </Badge>
                </div>
                <div className="text-xs text-surface-400">
                  {system.make} {system.model} · Installed {system.installationDate} · Life: {system.expectedServiceLife}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Key Contacts Section */}
      <SectionCard
        icon={<Contact className="h-5 w-5 text-cyan-400" />}
        title="Key Contacts"
      >
        {keyContacts.length === 0 ? (
          <EmptyState message="No key contacts recorded." />
        ) : (
          <div className="space-y-2">
            {keyContacts.map((contact, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-900/50"
              >
                <div>
                  <span className="text-sm font-medium text-surface-200">{contact.contactName}</span>
                  <span className="text-xs text-surface-400 ml-2">({contact.role})</span>
                </div>
                <div className="text-xs text-surface-400">
                  {contact.firmName} · {contact.email}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Document Archive Section */}
      <SectionCard
        icon={<Archive className="h-5 w-5 text-amber-400" />}
        title="Document Archive"
      >
        {archivedDocuments.length === 0 ? (
          <EmptyState message="No documents archived." />
        ) : (
          <div className="space-y-2">
            {archivedDocuments.map((doc, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-900/50"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-surface-400" aria-hidden="true" />
                  <span className="text-sm text-surface-200">{doc.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{doc.type}</Badge>
                  <span className="text-xs text-surface-500">{doc.uploadDate}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Access info */}
      {userRole && (
        <div className="text-xs text-surface-500 flex items-center gap-2">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            Access level: <span className="text-surface-300 font-medium">{userRole.replace(/_/g, ' ')}</span>
            {isReadOnly && ' (read-only)'}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InfoField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wider text-surface-500">{label}</p>
      <p className="text-sm text-surface-200 flex items-center gap-1.5">
        {icon && <span className="text-surface-400">{icon}</span>}
        {value}
      </p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-surface-500 py-4 text-center">{message}</p>
  );
}

function CertStatusBadge({ status }: { status: 'valid' | 'expiring' | 'expired' }) {
  const styles: Record<string, string> = {
    valid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    expiring: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    expired: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <Badge className={styles[status]}>
      {status}
    </Badge>
  );
}

function SubscriptionStatusIndicator({
  planType,
  renewalDate,
  holderId,
}: {
  planType: string;
  renewalDate?: string;
  holderId?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 capitalize">
        {planType}
      </Badge>
      {renewalDate && (
        <span className="text-xs text-surface-400">Renews: {formatDate(renewalDate)}</span>
      )}
      {holderId && (
        <span className="text-xs text-surface-500">Holder: {holderId}</span>
      )}
    </div>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
