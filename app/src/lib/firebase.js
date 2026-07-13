// Firebase init — modular SDK, same project + anonymous auth as the legacy app.
// The config is public by design (it's shipped in the deployed HTML today);
// Firestore rules + anonymous auth are the actual gate.
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAemhu47amA0jqkYOKMM1wo4COgFRSxWTc",
  authDomain: "wedding-planner-992a3.firebaseapp.com",
  projectId: "wedding-planner-992a3",
  storageBucket: "wedding-planner-992a3.firebasestorage.app",
  messagingSenderId: "1039879489750",
  appId: "1:1039879489750:web:b79c4991c1d741d28b2177",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// resolves once the anonymous session exists (same behavior as legacy _authReady)
export const authReady = signInAnonymously(getAuth(app)).catch((e) => {
  const el = document.getElementById("app");
  if (el)
    el.innerText =
      "Couldn't connect to the shared database.\n\n" +
      "Most likely fix: in the Firebase console, go to Build → Authentication → " +
      "Sign-in method and enable Anonymous sign-in.\n\nTechnical detail: " + e.message;
  throw e;
});
