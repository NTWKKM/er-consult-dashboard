import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPe0VuVAtIjQMbOLmMu2hht2yGZfww7hE",
  authDomain: "er-mnrh-consultingform.firebaseapp.com",
  projectId: "er-mnrh-consultingform",
  storageBucket: "er-mnrh-consultingform.firebasestorage.app",
  messagingSenderId: "759379378215",
  appId: "1:759379378215:web:5f26209516b14a68080e02",
  measurementId: "G-QQG87YV85F"
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

