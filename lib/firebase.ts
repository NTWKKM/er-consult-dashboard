import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// [NEW] Runtime validation for environment variables to prevent silent failures
if (typeof window !== "undefined" && !firebaseConfig.apiKey) {
  console.error(
    "🚨 Firebase Configuration Error: 'NEXT_PUBLIC_FIREBASE_API_KEY' is missing. " +
    "Please check your environment variables (.env.local) to ensure the dashboard functions correctly."
  );
}

// Initialize Firebase only if it hasn't been initialized already (important for Next.js hot-reloading)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with persistent local cache for offline support.
// ER environments may have unstable WiFi — this lets doctors view cached data
// and queued writes auto-sync when connectivity returns.
let db: Firestore;
if (typeof window === "undefined") {
  // Server-side: skip persistence APIs (IndexedDB not available)
  db = getFirestore(app);
} else {
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    // Firestore already initialized (e.g. Next.js hot-reload) or persistence unavailable
    console.warn("Firestore: falling back to existing instance.", error);
    db = getFirestore(app);
  }
}

export { db };

