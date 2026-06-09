import type { CPDCertificate, CPDCourse, CPDAttempt, CPDProfessionalProfile } from './cpdTypes';

export function createCertificateAfterPass(params: {
  learner: CPDProfessionalProfile;
  course: CPDCourse;
  attempt: CPDAttempt;
  verificationBaseUrl: string;
}): CPDCertificate {
  if (!params.attempt.passed) throw new Error('Cannot issue certificate for failed or manually pending attempt.');
  const verificationCode = `ARCHITEX-CPD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const id = `cert_${params.course.id}_${params.learner.userId}`;
  return {
    id,
    userId: params.learner.userId,
    learnerName: params.learner.fullName,
    professionalBody: params.learner.professionalBody,
    registrationNumber: params.learner.registrationNumber,
    courseId: params.course.id,
    courseTitle: params.course.title,
    providerName: params.course.providerName,
    accreditationReference: params.course.accreditationReference,
    creditsAwarded: params.course.approvedCredits,
    passed: true,
    issueDate: new Date().toISOString(),
    verificationCode,
    verificationUrl: `${params.verificationBaseUrl.replace(/\/$/, '')}/cpd/certificates/verify/${verificationCode}`,
    pdfPath: `/certificates/${id}.pdf`,
  };
}

export function renderCertificateText(certificate: CPDCertificate): string {
  return [
    'ARCHITEX CPD CERTIFICATE',
    `Awarded to: ${certificate.learnerName}`,
    `Professional body: ${certificate.professionalBody}`,
    certificate.registrationNumber ? `Registration number: ${certificate.registrationNumber}` : undefined,
    `Course: ${certificate.courseTitle}`,
    `Provider: ${certificate.providerName}`,
    certificate.accreditationReference ? `Accreditation reference: ${certificate.accreditationReference}` : undefined,
    `CPD credits awarded: ${certificate.creditsAwarded}`,
    `Assessment result: Passed`,
    `Issue date: ${certificate.issueDate}`,
    `Verification code: ${certificate.verificationCode}`,
    `Verify at: ${certificate.verificationUrl}`,
  ].filter(Boolean).join('\n');
}
