import { test, expect } from '@playwright/test';

test.describe('Architect quickscan browser harness', () => {
  test('job 177847582 upload/scan/comment/notify workflow runs in the browser', async ({ page }) => {
    await page.setContent(`
      <!doctype html>
      <html>
        <body>
          <main>
            <h1>Architect Quickscan Browser Harness</h1>
            <section aria-label="upload new plan">
              <label>
                Job ID
                <input id="job-id" aria-label="Job ID" value="177847582" />
              </label>
              <input id="new-plan" aria-label="New plan file" type="file" accept="application/pdf,image/*" />
              <button id="upload-plan">Upload Plan</button>
            </section>

            <section aria-label="file manager">
              <article data-file-id="file-floor-plan-1">
                <h2>job-177847582-floor-plan.pdf</h2>
                <button id="scan-existing">Scan</button>
              </article>
            </section>

            <section id="progress" aria-label="AR Orchestration Automated Process" hidden>
              <p id="agent-name"></p>
              <p id="agent-activity"></p>
            </section>

            <output id="result"></output>
          </main>

          <script>
            const calls = [];
            const existingFile = {
              id: 'file-floor-plan-1',
              url: 'https://example.com/job-177847582-floor-plan.pdf',
              fileName: 'job-177847582-floor-plan.pdf',
              fileType: 'application/pdf',
              fileSize: 2048,
              uploadedBy: 'arch-177847582',
              uploadedAt: '2026-05-04T00:00:00.000Z',
              context: 'submission',
              jobId: '177847582',
            };

            const job = {
              id: '177847582',
              clientId: 'client-177847582',
              selectedArchitectId: 'arch-177847582',
              title: 'Full test flow work job 177847582',
              status: 'in-progress',
            };

            window.__quickscanCalls = calls;

            async function uploadAndTrackFile(file, options) {
              calls.push({ type: 'uploadAndTrackFile', fileName: file.name, options });
              return 'https://example.com/uploaded-new-plan.pdf';
            }

            async function addDoc(path, payload) {
              calls.push({ type: 'addDoc', path, payload });
              return { id: 'submission-177847582' };
            }

            async function updateDoc(path, payload) {
              calls.push({ type: 'updateDoc', path, payload });
            }

            async function reviewDrawing(drawingUrl, drawingName, onProgress, submissionId) {
              calls.push({ type: 'reviewDrawing', drawingUrl, drawingName, submissionId });
              onProgress({ percentage: 25, agentName: 'SANS 10400-K Wall Agent', activity: 'Checking wall thicknesses...', completedAgents: [] });
              onProgress({ percentage: 85, agentName: 'Chief Architect Orchestrator', activity: 'Generating final report...', completedAgents: ['Wall', 'Fenestration', 'Fire', 'Area'] });
              return {
                status: 'passed',
                feedback: 'AI agents confirm the floor plan is ready with minor notes.',
                categories: [{ name: 'General', issues: [] }],
                traceLog: 'Orchestrator and specialized agents completed.',
              };
            }

            async function notifyDrawingSubmitted(clientId, drawingName, jobId, submissionId) {
              calls.push({ type: 'notifyDrawingSubmitted', clientId, drawingName, jobId, submissionId });
            }

            async function notifyAIReviewComplete(clientId, architectId, drawingName, status, jobId, submissionId) {
              calls.push({ type: 'notifyAIReviewComplete', clientId, architectId, drawingName, status, jobId, submissionId });
            }

            function setProgress(progress) {
              document.querySelector('#progress').hidden = false;
              document.querySelector('#agent-name').textContent = progress.agentName;
              document.querySelector('#agent-activity').textContent = progress.activity;
            }

            async function runQuickscan(file) {
              const submission = await addDoc('jobs/' + file.jobId + '/submissions', {
                jobId: file.jobId,
                architectId: job.selectedArchitectId,
                drawingUrl: file.url,
                drawingName: file.fileName,
                status: 'ai_reviewing',
              });

              await notifyDrawingSubmitted(job.clientId, file.fileName, file.jobId, submission.id);
              const aiReview = await reviewDrawing(file.url, file.fileName, setProgress, submission.id);
              const architectComment = window.prompt('AI quick scan ' + aiReview.status + '. Add your comment for the client before sending the notification:', aiReview.feedback);
              if (!architectComment || !architectComment.trim()) throw new Error('Architect comment is required before notifying the client.');

              await updateDoc('jobs/' + file.jobId + '/submissions/' + submission.id, {
                status: aiReview.status === 'passed' ? 'ai_passed' : 'ai_failed',
                aiFeedback: aiReview.feedback,
                aiStructuredFeedback: aiReview.categories,
                architectComment: architectComment.trim(),
              });

              await notifyAIReviewComplete(job.clientId, job.selectedArchitectId, file.fileName, aiReview.status, file.jobId, submission.id);
              document.querySelector('#result').textContent = 'Quick scan complete. Client notification sent.';
            }

            document.querySelector('#upload-plan').addEventListener('click', async () => {
              const file = document.querySelector('#new-plan').files[0];
              const jobId = document.querySelector('#job-id').value.trim();
              if (!file) throw new Error('Choose a PDF or image plan to upload.');
              await uploadAndTrackFile(file, {
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                uploadedBy: 'arch-177847582',
                context: 'submission',
                jobId,
              });
            });

            document.querySelector('#scan-existing').addEventListener('click', () => runQuickscan(existingFile));
          </script>
        </body>
      </html>
    `);

    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('AI quick scan passed');
      await dialog.accept('Reviewed AI feedback and sent annotated comments to the client.');
    });

    await page.getByLabel('New plan file').setInputFiles({
      name: 'new-floor-plan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('browser floor plan'),
    });
    await page.getByRole('button', { name: 'Upload Plan' }).click();

    await page.getByRole('button', { name: 'Scan' }).click();

    await expect(page.getByLabel('AR Orchestration Automated Process')).toBeVisible();
    await expect(page.locator('#result')).toHaveText('Quick scan complete. Client notification sent.');

    const calls = await page.evaluate(() => (window as any).__quickscanCalls);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'uploadAndTrackFile',
        fileName: 'new-floor-plan.pdf',
        options: expect.objectContaining({ jobId: '177847582', context: 'submission' }),
      }),
      expect.objectContaining({
        type: 'addDoc',
        path: 'jobs/177847582/submissions',
        payload: expect.objectContaining({ status: 'ai_reviewing', drawingName: 'job-177847582-floor-plan.pdf' }),
      }),
      expect.objectContaining({
        type: 'reviewDrawing',
        drawingUrl: 'https://example.com/job-177847582-floor-plan.pdf',
        submissionId: 'submission-177847582',
      }),
      expect.objectContaining({
        type: 'updateDoc',
        path: 'jobs/177847582/submissions/submission-177847582',
        payload: expect.objectContaining({
          status: 'ai_passed',
          architectComment: 'Reviewed AI feedback and sent annotated comments to the client.',
        }),
      }),
      expect.objectContaining({
        type: 'notifyAIReviewComplete',
        clientId: 'client-177847582',
        architectId: 'arch-177847582',
        status: 'passed',
        jobId: '177847582',
      }),
    ]));
  });
});