<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2ae3d9c3-70e6-4323-8a95-9d566bd24635

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Production Deployment

Because this application uses a custom Express setup (`server.ts`) alongside a Vite Single Page Application, it **requires a long-running Node.js environment**. 

1. **Recommended Platforms**:
   - [Render](https://render.com) (Web Service)
   - [Google Cloud Run](https://cloud.google.com/run)
   - [Fly.io](https://fly.io)

2. **Deployment Steps**:
   - Provide your environment variables (Firebase config, API keys) securely to your hosting provider.
   - Run `npm run build` during your build step.
   - Start the app via `NODE_ENV=production node server.js` (or use `tsx server.ts` depending on your build target pipeline).

> **Note**: Vercel is primarily designed for stateless serverless functions. While you *could* split your endpoints into Vercel Serverless Functions (`/api/*`), this project is bundled to run as a monolithic Express app. If you plan to deploy the frontend-only on Vercel, ensure the `vercel.json` config routes `/api/*` outward to your Node server.
