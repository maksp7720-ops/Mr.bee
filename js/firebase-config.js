import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCo6ddjQezZVGxBkB-Klq7FB81akYlkXr4",
  authDomain: "mrbeeshop-ea5cd.firebaseapp.com",
  projectId: "mrbeeshop-ea5cd",
  storageBucket: "mrbeeshop-ea5cd.firebasestorage.app",
  messagingSenderId: "886406189305",
  appId: "1:886406189305:web:ceebb6d88ed3969fb29228"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const PAGE_SIZE = 12;
