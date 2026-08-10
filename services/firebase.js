const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

const {
  getFirestore,
} = require("firebase-admin/firestore");


// ========================================
// FIREBASE CONFIG
// ========================================

const serviceAccount = {

  projectId:
    process.env.FIREBASE_PROJECT_ID,

  clientEmail:
    process.env.FIREBASE_CLIENT_EMAIL,

  privateKey:
    process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY
          .replace(/\\n/g, "\n")
      : undefined,

};


// ========================================
// VALIDATION
// ========================================

if (
  !serviceAccount.projectId ||
  !serviceAccount.clientEmail ||
  !serviceAccount.privateKey
) {

  throw new Error(
    "❌ Firebase environment variables are missing"
  );

}


// ========================================
// INITIALIZE FIREBASE
// ========================================

const firebaseApp =
  getApps().length === 0
    ? initializeApp({
        credential:
          cert(serviceAccount),
      })
    : getApps()[0];


// ========================================
// FIRESTORE
// ========================================

const db =
  getFirestore(firebaseApp);


// ========================================
// EXPORT
// ========================================

module.exports = {
  firebaseApp,
  db,
};