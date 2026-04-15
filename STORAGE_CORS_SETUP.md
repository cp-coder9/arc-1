# Firebase Storage CORS Setup

When hosting your application on a custom domain (like Vercel) and uploading files directly to Firebase Storage from the browser, you must configure CORS (Cross-Origin Resource Sharing) on your storage bucket.

If you don't do this, you will see errors like:
`Response to preflight request doesn't pass access control check: It does not have HTTP ok status.`

## How to fix it

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Make sure you have selected your Firebase project (`gen-lang-client-0880960511`) from the project dropdown at the top.
3. Open the **Cloud Shell** (the terminal icon `>_` in the top right corner).
4. In the Cloud Shell, run the following command to create a `cors.json` file:

```bash
echo '[{"origin": ["*"],"method": ["GET", "HEAD", "PUT", "POST", "DELETE"],"maxAgeSeconds": 3600}]' > cors.json
```

5. Then, apply this configuration to your Firebase Storage bucket by running:

```bash
gsutil cors set cors.json gs://gen-lang-client-0880960511.firebasestorage.app
```

*(Note: If you are using a different bucket name, replace `gen-lang-client-0880960511.firebasestorage.app` with your actual bucket name found in your Firebase Console under Storage).*

Once this is done, refresh your Vercel app and try uploading the plan again. The CORS error will be gone!
