/**
 * Firebase Storage blob adapter.
 * Replaces @vercel/blob with Firebase Cloud Storage (GCS).
 */
import { getStorage } from "firebase-admin/storage";
import { getApps, initializeApp } from "firebase-admin/app";

const BUCKET_NAME = "gen-lang-client-0880960511.firebasestorage.app";

function getBucket() {
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0880960511" });
  }
  return getStorage().bucket(BUCKET_NAME);
}

export interface BlobPutResult {
  url: string;
  downloadUrl: string;
  pathname: string;
}

export async function put(
  filename: string,
  data: Buffer | Uint8Array | ArrayBuffer | Blob,
  options?: { access?: string; contentType?: string; addRandomSuffix?: boolean },
): Promise<BlobPutResult> {
  const bucket = getBucket();
  const suffix = options?.addRandomSuffix ?? true;
  const ext = filename.includes(".") ? filename.split(".").pop() : "";
  const base = filename.replace(/\.[^.]+$/, "");
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const random = suffix ? "-" + crypto.randomUUID().slice(0, 8) : "";
  const destName = `uploads/${safe}${random}${ext ? "." + ext : ""}`;

  const file = bucket.file(destName);
  await file.save(data, {
    contentType: options?.contentType || "application/octet-stream",
    public: true,
    metadata: { cacheControl: "public, max-age=31536000" },
  });

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${destName}`;
  return {
    url: publicUrl,
    downloadUrl: publicUrl,
    pathname: destName,
  };
}

export async function del(url: string, _options?: { token?: string }): Promise<void> {
  const bucket = getBucket();
  const prefix = `https://storage.googleapis.com/${BUCKET_NAME}/`;
  if (!url.startsWith(prefix)) {
    // Not a Firebase Storage URL — might already be deleted or from a different source
    return;
  }
  const pathname = url.slice(prefix.length);
  await bucket.file(pathname).delete();
}
