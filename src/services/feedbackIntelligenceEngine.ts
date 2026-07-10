/**
 * Feedback Loop — Intelligence Engine
 *
 * Server-side AI processing for feedback deduplication, sentiment analysis,
 * category assignment, and clustering. Uses the existing Gemini infrastructure
 * via the server-side REST API pattern.
 *
 * Processing flow:
 * 1. New submission persisted → trigger processSubmission()
 * 2. AI computes similarity against open clusters (threshold: 0.75)
 * 3. Merge into existing cluster OR create new cluster
 * 4. Assign sentiment label (skip AI for descriptions <10 chars)
 * 5. Recompute severity score for affected cluster
 * 6. Flag category mismatches for operator review
 * 7. If severity ≥8, create Action Centre inbox item
 *
 * Fallback: If Gemini is unavailable or times out (30s), create new cluster,
 * assign neutral sentiment, queue for reprocessing.
 *
 * @module feedbackIntelligenceEngine
 */

import { adminDb } from '@/lib/firebase-admin';
import type {
  FeedbackSubmission,
  FeedbackCluster,
  FeedbackSentiment,
  ProcessingResult,
} from '@/services/feedbackTypes';
import { createCluster, mergeSubmissionIntoCluster } from '@/services/feedbackClusterManager';
import { computeSeverityScore } from '@/services/feedbackSeverity';

// ─── Constants ──────────────────────────────────────────────────────────────────

const FEEDBACK_CLUSTERS_COLLECTION = 'feedback_clusters';
const FEEDBACK_SUBMISSIONS_COLLECTION = 'feedback_submissions';
const SIMILARITY_THRESHOLD = 0.75;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash';

// ─── Server-Side Gemini Helper ──────────────────────────────────────────────────

/**
 * Retrieves Gemini API key and model from system_settings or environment.
 */
async function getServerLLMConfig(): Promise<{ apiKey: string; model: string }> {
  try {
    const doc = await adminDb.collection('system_settings').doc('llm_config').get();
    if (doc.exists) {
      const data = doc.data();
      const apiKey = data?.apiKey || process.env.GEMINI_API_KEY || '';
      const model = data?.model || DEFAULT_MODEL;
      return { apiKey, model };
    }
  } catch (error) {
    console.error('[IntelligenceEngine] Error fetching LLM config:', error);
  }
  return { apiKey: process.env.GEMINI_API_KEY || '', model: DEFAULT_MODEL };
}

/**
 * Calls the Gemini REST API server-side (no client auth needed).
 * Returns the text response or throws on failure.
 */
async function callGeminiServer(
  systemInstruction: string,
  prompt: string
): Promise<string> {
  const { apiKey, model } = await getServerLLMConfig();

  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
  };

  const response = await fetch(
    `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API failed: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No content in Gemini response');
  }
  return text;
}

// ─── AI Prompt Templates ────────────────────────────────────────────────────────

const FEEDBACK_SYSTEM_INSTRUCTION = `You are a feedback analysis AI for a Built Environment OS platform (Architex). Your job is to:
1. Compare new feedback against existing clusters for deduplication
2. Assign sentiment labels
3. Assign an AI category
Return valid JSON only. Do not include markdown fencing.`;

function buildDeduplicationPrompt(
  submission: FeedbackSubmission,
  clusters: Array<{ id: string; title: string; category: string; submissionIds: string[] }>
): string {
  const clusterSummaries = clusters.map(c =>
    `- Cluster "${c.title}" (id: ${c.id}, category: ${c.category}, submissions: ${c.submissionIds.length})`
  ).join('\n');

  return `Analyze this new feedback submission and compare it against existing clusters.

NEW SUBMISSION:
- Category (user-selected): ${submission.category}
- Description: "${submission.description}"
- Page: ${submission.contextSnapshot.pagePath}
- Module: ${submission.contextSnapshot.activeModule}

EXISTING OPEN CLUSTERS:
${clusterSummaries || '(none)'}

Return JSON with:
{
  "bestMatchClusterId": "<cluster id or null if no match>",
  "similarityScore": <0.0 to 1.0>,
  "sentiment": "<positive|neutral|negative|frustrated>",
  "aiCategory": "<bug|feature_request|usability|praise>",
  "clusterTitle": "<suggested title if new cluster needed>"
}

Rules:
- similarityScore should be >0.75 only if the submission is clearly about the same issue as the cluster
- sentiment should reflect the emotional tone of the description
- aiCategory is your independent assessment of the correct category
- clusterTitle is only needed when similarityScore <= 0.75 (new cluster)`;
}

// ─── Core Processing ────────────────────────────────────────────────────────────

/**
 * Processes a new feedback submission through the Intelligence Engine.
 *
 * 1. Fetches all open clusters
 * 2. Calls Gemini for similarity, sentiment, and category analysis
 * 3. Merges into existing cluster or creates new one
 * 4. Recomputes severity score
 * 5. Updates submission with AI results
 *
 * @throws Error if processing fails (caller handles fallback)
 */
export async function processSubmission(
  submission: FeedbackSubmission
): Promise<ProcessingResult> {
  // Short descriptions get neutral sentiment without AI
  const skipAI = submission.description.length < 10;

  // Fetch open clusters for comparison
  const clustersSnapshot = await adminDb
    .collection(FEEDBACK_CLUSTERS_COLLECTION)
    .where('open', '==', true)
    .get();

  const existingClusters = clustersSnapshot.docs.map(doc => ({
    id: doc.id,
    title: (doc.data() as FeedbackCluster).title,
    category: (doc.data() as FeedbackCluster).category,
    submissionIds: (doc.data() as FeedbackCluster).submissionIds,
  }));

  let sentiment: FeedbackSentiment = 'neutral';
  let aiCategory: string = submission.category;
  let bestMatchClusterId: string | null = null;
  let similarityScore = 0;
  let clusterTitle = submission.description.slice(0, 50);

  if (!skipAI) {
    // Call Gemini for analysis
    const prompt = buildDeduplicationPrompt(submission, existingClusters);
    const rawResponse = await callGeminiServer(FEEDBACK_SYSTEM_INSTRUCTION, prompt);

    // Parse AI response
    try {
      const parsed = JSON.parse(rawResponse.trim());
      sentiment = parsed.sentiment || 'neutral';
      aiCategory = parsed.aiCategory || submission.category;
      similarityScore = typeof parsed.similarityScore === 'number' ? parsed.similarityScore : 0;
      bestMatchClusterId = parsed.bestMatchClusterId || null;
      clusterTitle = parsed.clusterTitle || clusterTitle;

      // Validate sentiment is in allowed set
      const validSentiments: FeedbackSentiment[] = ['positive', 'neutral', 'negative', 'frustrated'];
      if (!validSentiments.includes(sentiment)) {
        sentiment = 'neutral';
      }
    } catch (parseError) {
      console.warn('[IntelligenceEngine] Failed to parse AI response, using defaults:', parseError);
      // Use defaults on parse failure
    }
  }

  // Determine category mismatch
  const categoryMismatch = aiCategory !== submission.category;

  // Update submission with AI results
  const submissionRef = adminDb.collection(FEEDBACK_SUBMISSIONS_COLLECTION).doc(submission.id);
  await submissionRef.update({
    sentiment,
    aiCategory,
    categoryMismatch,
    updatedAt: new Date().toISOString(),
  });

  // Update local submission object for cluster operations
  const updatedSubmission: FeedbackSubmission = {
    ...submission,
    sentiment,
    aiCategory,
    categoryMismatch,
  };

  // Merge or create cluster
  let clusterId: string;
  let isNewCluster: boolean;

  if (bestMatchClusterId && similarityScore > SIMILARITY_THRESHOLD) {
    // Verify the cluster still exists
    const clusterDoc = await adminDb
      .collection(FEEDBACK_CLUSTERS_COLLECTION)
      .doc(bestMatchClusterId)
      .get();

    if (clusterDoc.exists) {
      const cluster = await mergeSubmissionIntoCluster(updatedSubmission, bestMatchClusterId);
      clusterId = bestMatchClusterId;
      isNewCluster = false;

      // Recompute severity score
      const newSeverity = computeSeverityScore(
        cluster.occurrenceCount,
        cluster.sentimentBreakdown,
        cluster.distinctUserCount
      );
      await adminDb.collection(FEEDBACK_CLUSTERS_COLLECTION).doc(clusterId).update({
        severityScore: newSeverity,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Cluster was deleted — create new
      const cluster = await createCluster(updatedSubmission, clusterTitle);
      clusterId = cluster.id;
      isNewCluster = true;
    }
  } else {
    // No match or below threshold — create new cluster
    const cluster = await createCluster(updatedSubmission, clusterTitle);
    clusterId = cluster.id;
    isNewCluster = true;
  }

  return {
    clusterId,
    isNewCluster,
    similarityScore,
    sentiment,
    aiCategory,
    categoryMismatch,
  };
}

/**
 * Generates an AI feature brief for a feature_request cluster.
 * Returns a formatted markdown string.
 */
export async function generateFeatureBrief(
  cluster: FeedbackCluster
): Promise<string> {
  const prompt = `Generate a feature brief for this feedback cluster:

Title: ${cluster.title}
Category: ${cluster.category}
Occurrence Count: ${cluster.occurrenceCount}
Distinct Users: ${cluster.distinctUserCount}
Severity Score: ${cluster.severityScore}
Average Sentiment: ${cluster.averageSentiment}

Return JSON with:
{
  "problemStatement": "<1-2 sentence problem description>",
  "affectedRoles": ["<role1>", "<role2>"],
  "suggestedScope": "<scope description>",
  "estimatedImpact": "<impact assessment>"
}`;

  const systemInstruction = `You are a product manager assistant. Generate concise feature briefs from user feedback data. Return valid JSON only.`;

  const rawResponse = await callGeminiServer(systemInstruction, prompt);
  return rawResponse;
}
