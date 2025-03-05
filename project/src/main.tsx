import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./AuthContext";
import { initializeApp } from "firebase/app";
import "./index.css";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDacjagZ8hpWY-YgqvLwWwvjz0Q8B2uLyM",
  authDomain: "csb-tools-4ee63.firebaseapp.com",
  projectId: "csb-tools-4ee63",
  storageBucket: "csb-tools-4ee63.firebasestorage.app",
  messagingSenderId: "167555268304",
  appId: "1:167555268304:web:fd9e95236a218a451068d5",
  measurementId: "G-EQ0GFEJ4R4",
};

// Initialize Firebase
initializeApp(firebaseConfig);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
