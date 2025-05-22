require("dotenv").config({ path: "./.env" }); // Load .env.local file
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const serviceAccount = require("./firebase.json"); // use your actual key file
// const serviceAccount = {
//   type: process.env.FIREBASE_TYPE,
//   project_id: process.env.FIREBASE_PROJECT_ID,
//   private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
//   private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Convert escaped newlines back
//   client_email: process.env.FIREBASE_CLIENT_EMAIL,
//   client_id: process.env.FIREBASE_CLIENT_ID,
//   auth_uri: "https://accounts.google.com/o/oauth2/auth",
//   token_uri: "https://oauth2.googleapis.com/token",
//   auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
//   client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
// };
// ✅ Initialize Firebase Admin only once
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_AI_APIKEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(cors({
  // origin: ["https://hireview-ten.vercel.app"],
  origin: ["http://localhost:3000"],
  methods : ["POST","GET"],
  credentials : true
}));


app.use(cors())
app.use(express.json());

app.get("/test",async (req,res)=>{
  res.json({message : "Hello"});
})

app.get("/api/users", async (req, res) => {
  try {
    const usersCollection = await db.collection("users").get();
    const users = usersCollection.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/api/interview/:interviewId/feedback", async (req, res) => {
  console.log(
    "Feedback request received for interview ID:",
    req.params.interviewId
  );
  const { Conversation, userId, jobRole, candidateName } = req.body;
  const { interviewId } = req.params;

  // console.log(Conversation);
  // console.log("This is the request body....", Conversation);
  const FeedbackPrompt = `
  {{conversation}}

Based on the Interview Conversation between the assistant and the user, provide a comprehensive feedback analysis.

For each question asked by the assistant:
1. Briefly state the question asked.
2. Summarize the user's response.
3. Analyze the relevance of the user's response to the question. Indicate if the answer **directly addresses the question ("relevant")**, is **partially relevant ("partially relevant")**, or is **irrelevant ("irrelevant")**. Explain your reasoning briefly. **Ensure the relevance value is enclosed in double quotes.**

Overall Feedback:
1. Provide a rating out of 10 for the following skills demonstrated by the user throughout the interview:
   - Technical Skills: <give rating out of 10>
   - Communication: <give rating out of 10>
   - Problem Solving: <give rating out of 10>
   - Experience: <give rating out of 10>

2. Give a detailed summary (in approximately 5-7 lines) of the overall interview. This summary should include:
   - The key topics discussed.
   - The user's strengths and weaknesses as evident from their responses.
   - An assessment of the depth and clarity of their answers.
   - Observations on their engagement and communication style. **Ensure this summary is enclosed in double quotes.**

3. Provide a clear recommendation for hire (**"Yes"**, **"No"**, or **"Maybe"** - **ensure the recommendation is enclosed in double quotes**).

4. Provide a brief recommendation message (1-2 lines) explaining the reasoning behind the hire recommendation. **Ensure this message is enclosed in double quotes.**

**You MUST respond with a valid JSON object in the following format. Ensure all string values are enclosed in double quotes:**
Give your response in JSON format:

{
  "feedback": {
    "questionAnalysis": [
      {
        "question": "<Question 1>",
        "userResponseSummary": "<Summary of user's answer>",
        "relevanceAnalysis": {
          "relevant": "true"/"false"/"partially relevant",
          "reasoning": "<Brief explanation of relevance>"
        }
      },
      {
        "question": "<Question 2>",
        "userResponseSummary": "<Summary of user's answer>",
        "relevanceAnalysis": {
          "relevant": "true"/"false"/"partially relevant",
          "reasoning": "<Brief explanation of relevance>"
        }
      },
      // ... (for each question asked)
    ],
    "overallRating": {
      "technicalSkills": <rating out of 10>,
      "communication": <rating out of 10>,
      "problemSolving": <rating out of 10>,
      "experience": <rating out of 10>
    },
    "overallSummary": "<Detailed summary of the interview in 5-7 lines>",
    "recommendation": "Yes"/"No"/"Maybe",
    "recommendationMessage": "<1-2 line message explaining the recommendation>"
  }
}
  `;

  const finalPrompt = FeedbackPrompt.replace(
    "{{conversation}}",
    JSON.stringify(Conversation)
  );

  try {
        const feedback = await model.generateContent(finalPrompt);
        if (
          feedback &&
          feedback.response &&
          feedback.response.candidates &&
          feedback.response.candidates.length > 0 &&
          feedback.response.candidates[0].content &&
          feedback.response.candidates[0].content.parts &&
          feedback.response.candidates[0].content.parts.length > 0
        ) {
          const rawText = feedback.response.candidates[0].content.parts[0].text;
    //       console.log("Raw Text---->", rawText);
    
          const jsonText = rawText.replace(/```json|```/g, "").trim();
          const parsedFeedback = JSON.parse(jsonText);
    
          console.log("This the feedback generated");
    //       console.log(parsedFeedback);
    
          // Save feedback to Firestore
          const feedbackData = {
            interviewId: interviewId,
            userId: req.body.userId, // Assuming you send userId in the request body
            questionAnalysis: parsedFeedback.feedback.questionAnalysis,
            overallRating: parsedFeedback.feedback.overallRating,
            overallSummary: parsedFeedback.feedback.overallSummary,
            recommendation: parsedFeedback.feedback.recommendation,
            recommendationMessage: parsedFeedback.feedback.recommendationMessage,
            createdAt: admin.firestore.Timestamp.now(),
          };
          const docRef = await db.collection("feedbacks").add(feedbackData);
          const feedbackId = docRef.id;
          console.log("Feedback saved to Firebase with ID:", feedbackId);
    
          res.status(200).json({ feedbackId }); // Return only the feedback ID
        } else {
          res
            .status(500)
            .json({ error: "Unexpected response structure from model", feedback });
        }
      } catch (error) {
        console.error("Error parsing feedback:", error);
        res
          .status(500)
          .json({ error: "Error processing feedback", details: error.message });
      }
    });

app.post("/api", async (req, res) => {
  // console.log(req);
  // console.log("body", req.body);
  const { type, role, level, techstack, amount, userid } = req.body;

  try {
    const prompt = `Prepare questions for a job interview.
        The job role is ${role}.
        The job experience level is ${level}.
        The tech stack used in the job is: ${techstack}.
        The focus between behavioural and technical questions should lean towards: ${type}.
        The amount of questions required is: ${amount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        Return the questions formatted like this:
        ["Question 1", "Question 2", "Question 3"]

        Thank you! <3`;

    const questions = await model.generateContent(prompt);
    // console.log("Type of questions:", typeof questions);
    // console.log("Value of questions:", questions);
    // console.log("Candidates:", questions.response.candidates);
    console.log(
      "Content Parts:",
      questions.response.candidates[0].content.parts
    );

    const rawText = questions.response.candidates[0].content.parts[0].text;
    const jsonString = rawText.replace(/```json\s*|\s*```/g, "");
    const parsedQuestions = JSON.parse(jsonString);

    const interview = {
      role: role,
      type: type,
      level: level,
      techstack: techstack,
      questions: parsedQuestions,
      userId: userid,
      finalized: true,
      createdAt: new Date().toISOString(),
    };

    console.log(interview);

    const docRef = await db.collection("interviews").add(interview);
    const interviewId = docRef.id;
    console.log(interviewId);

    res.status(200).json({ interviewId });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/interviewIDs', async (req, res) => {
  const  userId  = req.query.userId; // Destructure userId correctly
  console.log(userId);

  if (!userId) {
    return res.status(400).json({ error: 'userId is required in request body' });
  }

  try {
    const interviewsRef = db.collection('interviews');
    const feedbackRef = db.collection('feedbacks');

    const interviewsSnapshot = await interviewsRef.where('userId', '==', userId).get();

    if (interviewsSnapshot.empty) {
      return res.status(404).json({ message: 'No interviews found for this user.' });
    }

    const results = [];

    for (const doc of interviewsSnapshot.docs) {
      const interviewId = doc.id;
      const interviewData = doc.data();
      var feedbackId = "NO";

      const querySnapshot = await feedbackRef.where('userId', '==', userId)
                                .where('interviewId', '==', interviewId).get();


      if (querySnapshot.empty) {
        console.log('❌ No feedback found for this interviewID');
      }
      else{
        console.log(`✅ feedback found for this ${interviewId}`);
        const firstDoc = querySnapshot.docs[0];
        feedbackId = firstDoc.id;
      }

      if(feedbackId!="NO"){
        results.push({
          interviewId,
          interview: interviewData,
          feedbackID: feedbackId,
        });
      }
    }
    res.json(results); // Send the response
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/feedbackID', async (req, res) => {
  console.log("Got a GET request for feedback ID...");

  const interviewId = req.query.Id;
  const userId = req.query.userId;

  console.log("Interview ID:", interviewId);
  console.log("User ID:", userId);

  if (!interviewId || !userId) {
    return res.status(400).json({ error: 'Both interviewId and userId are required in query params' });
  }

  try {
    const feedbackRef = db.collection('feedbacks');

    // Log all feedbacks (optional - for full view)
    const allFeedback = await feedbackRef.get();
    allFeedback.forEach(doc => {
      console.log(`Full list => ${doc.id}: ${doc.data().interviewId} | ${doc.data().userId}`);
    });

    // Query only by userId
    // const querySnapshot = await feedbackRef.where('userId', '==', userId).get();
    const querySnapshot = await feedbackRef.where('userId', '==', userId)
                                .where('interviewId', '==', interviewId).get();

    if (querySnapshot.empty) {
      console.log('❌ No feedback found for this user');
      return res.status(404).json({ error: 'No feedbacks found for this user' });
    }

    // Log all feedbackIds that belong to this user
    console.log(`✅ Feedback IDs for userId: ${userId}`);
    querySnapshot.forEach(doc => {
      console.log(`- ${doc.id}`);
    });

    const firstDoc = querySnapshot.docs[0];
    const feedbackId = firstDoc.id;
    const feedbackData = firstDoc.data();
    console.log(`✅ Returning first feedback ID for user: ${userId}`);
    console.log(`- ${feedbackId}`);

    // Optionally respond with the list of IDs
    // const feedbackIds = querySnapshot.docs.map(doc => doc.id);
    
    res.status(200).json({ feedbackId, feedback: feedbackData });

  } catch (err) {
    console.error('🔥 Error fetching feedbacks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server is running on http://localhost:${process.env.PORT}`);
});
