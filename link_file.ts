import "dotenv/config";
import { adminDb } from "./src/lib/firebase-admin.js";

async function linkFileToJob() {
  const jobId = "117847582";
  const fileId = "N5rZyvN280VvFdcQOACU";
  
  console.log(`Linking file ${fileId} to job ${jobId}`);
  
  await adminDb.collection("uploaded_files").doc(fileId).update({
    jobId: jobId
  });
  
  // Assign an architect to the job
  await adminDb.collection("jobs").doc(jobId).update({
    selectedArchitectId: "lisxDLMW5dQKSYixSWRaxXWXMVr2", // The user who uploaded the file
    status: "in-progress"
  });

  console.log("File linked and architect assigned.");
}

linkFileToJob().catch(console.error);
