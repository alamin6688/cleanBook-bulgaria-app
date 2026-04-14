import admin from "firebase-admin";
import path from "path";
import fs from "fs";

const serviceAccountPath = path.join(process.cwd(), "src/app/lib/firebase-service-account.json");

// Check if file exists to avoid ENOENT error
if (fs.existsSync(serviceAccountPath)) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
    });
    console.log("🚀 Firebase Admin initialized successfully!");
  } catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error);
  }
} else {
  console.warn("⚠️ Firebase service account file missing. Push notifications are currently DISABLED.");
  console.warn("💡 To enable, place 'firebase-service-account.json' in 'src/app/lib/'");
}

export default admin;
