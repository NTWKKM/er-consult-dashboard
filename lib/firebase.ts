import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase only if it hasn't been initialized already (important for Next.js hot-reloading)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence (IndexedDB cache)
// ER environments may have unstable WiFi — this lets doctors view cached data
// and queued writes auto-sync when connectivity returns.
if (typeof window !== "undefined") {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      // Multiple tabs open; persistence can only be enabled in one tab at a time
      console.warn("Firestore persistence unavailable: multiple tabs open.");
    } else if (err.code === "unimplemented") {
      // The current browser does not support IndexedDB persistence
      console.warn("Firestore persistence unavailable: browser not supported.");
    }
  });
}

export { db };

