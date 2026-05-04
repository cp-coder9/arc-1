import "dotenv/config";
import { adminDb } from "./src/lib/firebase-admin.js";

async function verifyJob() {
  const jobId = "117847582";
  const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
  
  if (jobDoc.exists) {
    console.log("Job exists:", jobDoc.data());
  } else {
    console.log("Job does not exist.");
    
    // Create the job for testing if it doesn't exist
    const newJob = {
      title: "Flow Architect Project",
      description: "Real-world test for AI integration and role assignment.",
      clientId: "test_client_id",
      status: "open",
      budget: 5000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      location: "Johannesburg",
      category: "Residential"
    };
    
    await adminDb.collection("jobs").doc(jobId).set(newJob);
    console.log("Created job 117847582 for testing.");
  }

  // Also check LLM config
  const llmConfigDoc = await adminDb.collection("system_settings").doc("llm_config").get();
  if (llmConfigDoc.exists) {
    console.log("LLM Config:", llmConfigDoc.data());
  } else {
    console.log("LLM Config does not exist. Creating default with Nvidia settings.");
    await adminDb.collection("system_settings").doc("llm_config").set({
      provider: "nvidia",
      apiKey: "env:NVIDIA_API_KEY",
      model: "meta/llama-3.1-405b-instruct",
      baseUrl: "https://integrate.api.nvidia.com/v1"
    });
  }
}

verifyJob().catch(console.error);
