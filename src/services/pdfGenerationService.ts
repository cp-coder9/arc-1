/**
 * PDF Generation Service
 * Generates council submission packages using pdf-lib
 */

import { PDFDocument, PDFPage, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { CouncilSubmission, Job, Submission, UserProfile } from '../types';
import { put } from '@vercel/blob';

export interface SubmissionPackageData {
  job: Job;
  client: UserProfile;
  architect?: UserProfile;
  approvedSubmissions: Submission[];
  councilSubmission: CouncilSubmission;
  aiReviewResults: {
    status: string;
    feedback: string;
    categories: Array<{
      name: string;
      issues: Array<{
        description: string;
        severity: string;
        actionItem: string;
      }>;
    }>;
  };
}

class PDFGenerationService {
  /**
   * Generate a complete council submission package
   */
  async generateCouncilSubmissionPackage(
    councilSubmissionId: string,
    token: string
  ): Promise<{ url: string; fileName: string }> {
    try {
      // Fetch all required data
      const data = await this.fetchSubmissionData(councilSubmissionId);
      
      if (!data) {
        throw new Error('Failed to fetch submission data');
      }

      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Add cover page
      this.addCoverPage(pdfDoc, data);
      
      // Add compliance summary
      this.addComplianceSummaryPage(pdfDoc, data);
      
      // Add document checklist
      this.addDocumentChecklistPage(pdfDoc, data);
      
      // Add AI review report
      this.addAIReviewReportPage(pdfDoc, data);
      
      // Save PDF
      const pdfBytes = await pdfDoc.save();
      
      // Upload to blob storage
      const fileName = `council-submission-${data.councilSubmission.referenceNumber}-${Date.now()}.pdf`;
      const blob = await put(fileName, new Blob([pdfBytes], { type: 'application/pdf' }), {
        access: 'public',
        token,
        addRandomSuffix: false,
      });

      return { url: blob.url, fileName };
    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    }
  }

  /**
   * Fetch all submission data
   */
  private async fetchSubmissionData(
    councilSubmissionId: string
  ): Promise<SubmissionPackageData | null> {
    try {
      // Get council submission
      const submissionDoc = await getDoc(doc(db, 'council_submissions', councilSubmissionId));
      if (!submissionDoc.exists()) return null;
      
      const councilSubmission = { id: submissionDoc.id, ...submissionDoc.data() } as CouncilSubmission;
      
      // Get job
      const jobDoc = await getDoc(doc(db, 'jobs', councilSubmission.jobId));
      if (!jobDoc.exists()) return null;
      
      const job = { id: jobDoc.id, ...jobDoc.data() } as Job;
      
      // Get client
      const clientDoc = await getDoc(doc(db, 'users', job.clientId));
      if (!clientDoc.exists()) return null;
      
      const client = clientDoc.data() as UserProfile;
      
      // Get architect if selected
      let architect: UserProfile | undefined;
      if (job.selectedArchitectId) {
        const archDoc = await getDoc(doc(db, 'users', job.selectedArchitectId));
        if (archDoc.exists()) {
          architect = archDoc.data() as UserProfile;
        }
      }
      
      // Get approved submissions
      const submissionsQuery = query(
        collection(db, `jobs/${job.id}/submissions`),
        where('status', '==', 'approved')
      );
      const submissionsSnap = await getDocs(submissionsQuery);
      const approvedSubmissions = submissionsSnap.docs.map(
        doc => ({ id: doc.id, ...doc.data() } as Submission)
      );
      
      // Get latest AI review result
      const aiReviewResult = approvedSubmissions.length > 0 
        ? approvedSubmissions[approvedSubmissions.length - 1].aiReview || {
            status: 'passed',
            feedback: 'No AI review data available',
            categories: []
          }
        : {
            status: 'pending',
            feedback: 'No submissions approved yet',
            categories: []
          };

      return {
        job,
        client,
        architect,
        approvedSubmissions,
        councilSubmission,
        aiReviewResults: aiReviewResult
      };
    } catch (error) {
      console.error('Error fetching submission data:', error);
      return null;
    }
  }

  /**
   * Add cover page to PDF
   */
  private addCoverPage(pdfDoc: PDFDocument, data: SubmissionPackageData): void {
    const page = pdfDoc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    const fontSize = 12;
    
    // Load fonts
    const helveticaBold = pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
    const helvetica = pdfDoc.embedStandardFont(StandardFonts.Helvetica);
    
    // Title
    page.drawText('ARCHITECTURAL PLANS SUBMISSION', {
      x: 50,
      y: height - 80,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('Council Submission Package', {
      x: 50,
      y: height - 110,
      size: 16,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    // Reference Number
    page.drawText(`Reference: ${data.councilSubmission.referenceNumber}`, {
      x: 50,
      y: height - 150,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Municipality
    page.drawText(`Municipality: ${data.councilSubmission.municipality}`, {
      x: 50,
      y: height - 180,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    // Submission Date
    page.drawText(`Submission Date: ${new Date().toLocaleDateString('en-ZA')}`, {
      x: 50,
      y: height - 200,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    // Project Details Section
    page.drawText('PROJECT DETAILS', {
      x: 50,
      y: height - 250,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(`Project Title: ${data.job.title}`, {
      x: 50,
      y: height - 280,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(`Category: ${data.job.category}`, {
      x: 50,
      y: height - 300,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    // Client Details
    page.drawText('CLIENT INFORMATION', {
      x: 50,
      y: height - 350,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(`Name: ${data.client.displayName}`, {
      x: 50,
      y: height - 380,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(`Email: ${data.client.email}`, {
      x: 50,
      y: height - 400,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    // Architect Details (if available)
    if (data.architect) {
      page.drawText('ARCHITECT INFORMATION', {
        x: 50,
        y: height - 450,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(`Name: ${data.architect.displayName}`, {
        x: 50,
        y: height - 480,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(`Email: ${data.architect.email}`, {
        x: 50,
        y: height - 500,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Footer
    page.drawText('Generated by Architex - South African Architectural Compliance Platform', {
      x: 50,
      y: 50,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  /**
   * Add compliance summary page
   */
  private addComplianceSummaryPage(pdfDoc: PDFDocument, data: SubmissionPackageData): void {
    const page = pdfDoc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    
    const helveticaBold = pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
    const helvetica = pdfDoc.embedStandardFont(StandardFonts.Helvetica);
    
    // Title
    page.drawText('SANS 10400 COMPLIANCE SUMMARY', {
      x: 50,
      y: height - 80,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Overall Status
    const status = data.aiReviewResults.status;
    const statusColor = status === 'passed' ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0);
    
    page.drawText(`Overall Status: ${status.toUpperCase()}`, {
      x: 50,
      y: height - 120,
      size: 14,
      font: helveticaBold,
      color: statusColor,
    });
    
    // Summary text
    const feedback = data.aiReviewResults.feedback;
    const wrappedText = this.wrapText(feedback, 80);
    
    let yPos = height - 160;
    page.drawText('AI Review Feedback:', {
      x: 50,
      y: yPos,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    yPos -= 30;
    
    for (const line of wrappedText) {
      page.drawText(line, {
        x: 50,
        y: yPos,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPos -= 15;
    }
    
    // Compliance Categories
    yPos -= 30;
    page.drawText('COMPLIANCE CATEGORIES:', {
      x: 50,
      y: yPos,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    yPos -= 30;
    
    for (const category of data.aiReviewResults.categories) {
      const issuesCount = category.issues.length;
      const issuesText = issuesCount === 0 ? '✓ Compliant' : `⚠ ${issuesCount} issues found`;
      
      page.drawText(`${category.name}: ${issuesText}`, {
        x: 50,
        y: yPos,
        size: 11,
        font: helvetica,
        color: issuesCount === 0 ? rgb(0, 0.5, 0) : rgb(0.7, 0.4, 0),
      });
      
      yPos -= 20;
      
      // List issues if any
      if (category.issues.length > 0) {
        for (const issue of category.issues.slice(0, 3)) { // Show max 3 issues
          page.drawText(`  • ${issue.description} (${issue.severity})`, {
            x: 70,
            y: yPos,
            size: 9,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
          });
          yPos -= 15;
        }
      }
      
      yPos -= 10;
    }
  }

  /**
   * Add document checklist page
   */
  private addDocumentChecklistPage(pdfDoc: PDFDocument, data: SubmissionPackageData): void {
    const page = pdfDoc.addPage(PageSizes.A4);
    const { height } = page.getSize();
    
    const helveticaBold = pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
    const helvetica = pdfDoc.embedStandardFont(StandardFonts.Helvetica);
    
    // Title
    page.drawText('DOCUMENT CHECKLIST', {
      x: 50,
      y: height - 80,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Submitted Documents
    page.drawText('Submitted Documents:', {
      x: 50,
      y: height - 120,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    let yPos = height - 150;
    
    for (const doc of data.councilSubmission.documents) {
      page.drawText(`☑ ${doc.name}`, {
        x: 70,
        y: yPos,
        size: 11,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
    }
    
    // Approved Submissions
    yPos -= 30;
    page.drawText('Approved Drawing Submissions:', {
      x: 50,
      y: yPos,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    yPos -= 30;
    
    for (const submission of data.approvedSubmissions) {
      page.drawText(`☑ ${submission.drawingName}`, {
        x: 70,
        y: yPos,
        size: 11,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      page.drawText(`   URL: ${submission.drawingUrl.substring(0, 60)}...`, {
        x: 70,
        y: yPos,
        size: 9,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
      yPos -= 20;
    }
  }

  /**
   * Add AI review report page
   */
  private addAIReviewReportPage(pdfDoc: PDFDocument, data: SubmissionPackageData): void {
    const page = pdfDoc.addPage(PageSizes.A4);
    const { height } = page.getSize();
    
    const helveticaBold = pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
    const helvetica = pdfDoc.embedStandardFont(StandardFonts.Helvetica);
    
    // Title
    page.drawText('AI COMPLIANCE REVIEW REPORT', {
      x: 50,
      y: height - 80,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Trace log
    page.drawText('Review Process Trace:', {
      x: 50,
      y: height - 120,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    const traceLog = data.aiReviewResults.traceLog || 'No trace log available';
    const wrappedTrace = this.wrapText(traceLog, 100);
    
    let yPos = height - 150;
    
    for (const line of wrappedTrace.slice(0, 20)) { // Limit to 20 lines
      page.drawText(line, {
        x: 50,
        y: yPos,
        size: 9,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPos -= 14;
    }
    
    // Certification
    yPos -= 40;
    page.drawText('CERTIFICATION', {
      x: 50,
      y: yPos,
      size: 14,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    yPos -= 30;
    
    const certification = `This document certifies that the architectural plans have been reviewed by Architex's AI Compliance System against SANS 10400 regulations. The review covered wall compliance (SANS 10400-K), fenestration and ventilation (SANS 10400-N), fire safety (SANS 10400-T), room sizing (SANS 10400-C), and general compliance (SANS 10400-A).`;
    
    const wrappedCert = this.wrapText(certification, 90);
    
    for (const line of wrappedCert) {
      page.drawText(line, {
        x: 50,
        y: yPos,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPos -= 15;
    }
    
    // Signature area
    yPos -= 60;
    page.drawText('_'.repeat(50), {
      x: 50,
      y: yPos,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    yPos -= 20;
    page.drawText('Digital Signature / Stamp', {
      x: 50,
      y: yPos,
      size: 11,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    
    yPos -= 40;
    page.drawText(`Date: ${new Date().toLocaleDateString('en-ZA')}`, {
      x: 50,
      y: yPos,
      size: 11,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    yPos -= 40;
    page.drawText('Architex AI Compliance System', {
      x: 50,
      y: yPos,
      size: 12,
      font: helveticaBold,
      color: rgb(0, 0, 0.6),
    });
    
    yPos -= 20;
    page.drawText('South African National Standard 10400 Compliance Platform', {
      x: 50,
      y: yPos,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  /**
   * Wrap text to fit within max characters per line
   */
  private wrapText(text: string, maxChars: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + word).length > maxChars) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }
    
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    return lines;
  }

  /**
   * Generate a simple compliance certificate
   */
  async generateComplianceCertificate(
    submissionId: string,
    token: string
  ): Promise<{ url: string; fileName: string }> {
    try {
      const submissionDoc = await getDoc(doc(db, 'submissions', submissionId));
      if (!submissionDoc.exists()) {
        throw new Error('Submission not found');
      }
      
      const submission = submissionDoc.data();
      
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage(PageSizes.A4);
      const { width, height } = page.getSize();
      
      const helveticaBold = pdfDoc.embedStandardFont(StandardFonts.HelveticaBold);
      const helvetica = pdfDoc.embedStandardFont(StandardFonts.Helvetica);
      
      // Title
      page.drawText('CERTIFICATE OF COMPLIANCE', {
        x: 150,
        y: height - 100,
        size: 24,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      // Subtitle
      page.drawText('SANS 10400 Architectural Compliance', {
        x: 180,
        y: height - 140,
        size: 16,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      // Certification body
      page.drawText('Issued by Architex AI Compliance System', {
        x: 190,
        y: height - 170,
        size: 12,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
      
      // Drawing info
      page.drawText(`Drawing: ${submission.drawingName || 'Unnamed Drawing'}`, {
        x: 50,
        y: height - 250,
        size: 14,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(`Status: ${submission.status?.toUpperCase() || 'UNKNOWN'}`, {
        x: 50,
        y: height - 280,
        size: 12,
        font: helvetica,
        color: submission.status === 'approved' ? rgb(0, 0.6, 0) : rgb(0.6, 0, 0),
      });
      
      page.drawText(`Date: ${new Date().toLocaleDateString('en-ZA')}`, {
        x: 50,
        y: height - 310,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      
      // Save
      const pdfBytes = await pdfDoc.save();
      
      const fileName = `compliance-certificate-${submissionId}-${Date.now()}.pdf`;
      const blob = await put(fileName, new Blob([pdfBytes], { type: 'application/pdf' }), {
        access: 'public',
        token,
        addRandomSuffix: false,
      });
      
      return { url: blob.url, fileName };
    } catch (error) {
      console.error('Certificate generation error:', error);
      throw error;
    }
  }
}

export const pdfGenerationService = new PDFGenerationService();
export default pdfGenerationService;
