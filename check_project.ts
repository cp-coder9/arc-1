import "dotenv/config";
import { adminDb } from "./src/lib/firebase-admin.js";

async function checkProjectFiles() {
  const jobId = "117847582";
  
  console.log(`Checking files for Job ID: ${jobId}`);
  
  const filesSnap = await adminDb.collection("uploaded_files").where("jobId", "==", jobId).get();
  
  if (filesSnap.empty) {
    console.log("No files found for this job ID.");
    
    // Check all files to see if any have a similar jobId or title
    const allFilesSnap = await adminDb.collection("uploaded_files").limit(5).get();
    console.log("Sample of all files:");
    allFilesSnap.docs.forEach(doc => console.log(doc.id, doc.data()));
  } else {
    console.log(`Found ${filesSnap.size} files for this job:`);
    filesSnap.docs.forEach(doc => console.log(doc.id, doc.data()));
  }

  // Check the job itself
  const jobDoc = await adminDb.collection("jobs").doc(jobId).get();
  if (jobDoc.exists) {
    console.log("Job Details:", jobDoc.data());
  } else {
    console.log("Job NOT found in 'jobs' collection.");
  }
}

checkProjectFiles().catch(console.error);
