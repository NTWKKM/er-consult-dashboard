import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";

// ข้อมูล Firebase ของคุณ (เอามาจากหน้า Firebase Console > Project Settings)
const firebaseConfig = {
  apiKey: "AIzaSyCPe0VuVAtIjQMbOLmMu2hht2yGZfww7hE",
  authDomain: "er-mnrh-consultingform.firebaseapp.com",
  projectId: "er-mnrh-consultingform",
  storageBucket: "er-mnrh-consultingform.firebasestorage.app",
  messagingSenderId: "759379378215",
  appId: "1:759379378215:web:5f26209516b14a68080e02",
  measurementId: "G-QQG87YV85F"
};

// Initialize Firebase
const app: FirebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db: Firestore = getFirestore(app);

console.log("✓ Firebase initialized successfully");
console.log("Project ID:", firebaseConfig.projectId);

export { db };