import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyC9xmsKpvF0-uAVv3Ty2oDPIEk38loac28",
  authDomain: "pagos-app-4397f.firebaseapp.com",
  projectId: "pagos-app-4397f",
  storageBucket: "pagos-app-4397f.firebasestorage.app",
  messagingSenderId: "469469494810",
  appId: "1:469469494810:web:7d683bbef7b530c46e1ba3",
  measurementId: "G-H13Y0TXP5M"
};

export const VAPID_KEY = "BNc48Kyojy7vL0f8fZ15wym-4UIEjZ_DFS4NL8aPg6Ilv13sEdic3aSwgwQxSoa5r-3LzCzDhe-JLAZuh6Wy4-M";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

let messaging = null;
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("FCM not supported:", e.message);
}
export { messaging, getToken, onMessage };
