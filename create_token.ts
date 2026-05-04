import "dotenv/config";
import { auth } from "./src/lib/firebase-admin.js";

async function createToken() {
  const uid = "w5ajHwNUVKeBSW9v6tW79kgSgE02"; // Flow Test Architect
  const token = await auth.createCustomToken(uid);
  console.log("CUSTOM_TOKEN:" + token);
}

createToken().catch(console.error);
