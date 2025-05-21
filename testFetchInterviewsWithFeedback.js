require("dotenv").config({ path: "./.env" }); // Load .env.local file
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const serviceAccount = require("./firebase.json"); // use your actual key file
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
const app = express();
app.use(cors())
app.use(express.json());
const userId = 'KHn544rjbUdS1TBKuF6dRb9nnSD3'
async function fetchInterviewsAndFeedback(userId) {
  try {
    const interviewsRef = db.collection('interviews');
    const feedbackRef = db.collection('feedback');

    const interviewsSnapshot = await interviewsRef.where('userId', '==', userId).get();

    if (interviewsSnapshot.empty) {
      console.log('No interviews found for this user.');
      return;
    }

    const results = [];

    for (const doc of interviewsSnapshot.docs) {
      const interviewId = doc.id;
      const interviewData = doc.data();

      const feedbackSnapshot = await feedbackRef
        .where('interviewId', '==', interviewId)
        .limit(1)
        .get();

      const feedbackData = !feedbackSnapshot.empty
        ? feedbackSnapshot.docs[0].data()
        : null;

      results.push({
        interviewId,
        interview: interviewData,
        feedback: feedbackData,
      });
    }

    console.log(JSON.stringify(results, null, 2)); // Pretty print
  } catch (err) {
    console.error('Error:', err);
  }
}
fetchInterviewsAndFeedback(userId);