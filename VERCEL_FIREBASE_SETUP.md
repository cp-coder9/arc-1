# Firebase & Vercel Setup Guide

This guide explains how to set up and link your Firebase database when hosting your application on Vercel.

## 1. Firebase Project Setup

1.  **Create a Firebase Project**: Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  **Enable Authentication**:
    *   Navigate to **Build > Authentication**.
    *   Click **Get Started**.
    *   Enable the **Google** sign-in provider (and **Email/Password** if your app uses it).
3.  **Create a Firestore Database**:
    *   Navigate to **Build > Firestore Database**.
    *   Click **Create database**.
    *   Choose a location and start in **Production mode** (or Test mode if you prefer, but Production is recommended with the rules provided in this project).
4.  **Register your Web App**:
    *   On the Project Overview page, click the **Web** icon (`</>`) to register a new app.
    *   Give it a nickname and click **Register app**.
    *   You will be presented with a `firebaseConfig` object. Keep this handy.

## 2. Configure Environment Variables

Vercel needs to know your Firebase configuration. Instead of hardcoding these values, we use environment variables.

1.  **Locate your Firebase Config**: In the Firebase Console, go to **Project Settings > General** and scroll down to your app's configuration. It looks like this:
    ```javascript
    const firebaseConfig = {
      apiKey: "...",
      authDomain: "...",
      projectId: "...",
      storageBucket: "...",
      messagingSenderId: "...",
      appId: "..."
    };
    ```
2.  **Add Variables to Vercel**:
    *   Go to your project on the [Vercel Dashboard](https://vercel.com/dashboard).
    *   Navigate to **Settings > Environment Variables**.
    *   Add the following variables (matching the keys in your `firebase-applet-config.json` or `firebase.ts`):
        *   `VITE_FIREBASE_API_KEY`
        *   `VITE_FIREBASE_AUTH_DOMAIN`
        *   `VITE_FIREBASE_PROJECT_ID`
        *   `VITE_FIREBASE_STORAGE_BUCKET`
        *   `VITE_FIREBASE_MESSAGING_SENDER_ID`
        *   `VITE_FIREBASE_APP_ID`
        *   `VITE_FIREBASE_DATABASE_ID` (Optional, defaults to `(default)`)

## 3. Link Firebase to your Domain

Firebase Authentication needs to allow your Vercel domain to perform sign-in operations.

1.  **Get your Vercel URL**: Find your production URL on the Vercel dashboard (e.g., `your-app.vercel.app`).
2.  **Add to Authorized Domains**:
    *   In the Firebase Console, go to **Build > Authentication > Settings > Authorized domains**.
    *   Click **Add domain** and enter your Vercel URL.

## 4. Deploy Firestore Rules

Ensure your database is secure by deploying the `firestore.rules` file included in this project.

1.  **Using Firebase CLI**:
    *   Install Firebase Tools: `npm install -g firebase-tools`.
    *   Login: `firebase login`.
    *   Initialize: `firebase init firestore`.
    *   Deploy: `firebase deploy --only firestore:rules`.

## 5. Final Verification

1.  Push your changes to your Git repository linked to Vercel.
2.  Vercel will automatically build and deploy your app.
3.  Visit your Vercel URL and test the login flow.

---

**Note**: If you are using the AI Studio Build environment, most of this is handled for you via the `set_up_firebase` tool, but these manual steps are essential for production hosting on Vercel.
