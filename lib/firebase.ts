import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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

export { db };
