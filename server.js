require("dotenv").config({ path: "./.env" }); // Load .env.local file
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const serviceAccount = require("./firebase.json"); // use your actual key file

// ✅ Initialize Firebase Admin only once
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_AI_APIKEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.use(cors());
app.use(express.json());

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
  const { conv, jobRole, candidateName } = req.body;
  const { interviewId } = req.params;

  console.log(conv);

  //   const FeedbackPrompt = `{{conversation}}
  // Depends on this Interview Conversation between assistant and user,
  // Give me feedback for user interview. Give me rating out of 10 for technical Skills,
  // Communication, Problem Solving, Experience. Also give me summary in 3 lines
  // about the interview and one line to let me know whether it is recommended
  // for hire or not with msg. Give me response in JSON format.
  // {
  //   feedback:{
  //     rating:{
  //       technicalSkills:<give rating out of 10>,
  //       communication:<give rating out of 10>,
  //       problemSolving:<give rating out of 10>,
  //       experience:<give rating out of 10>
  //     },
  //     summary:<in 3 Line>,
  //     Recommendation:"",
  //     RecommendationMsg:""
  //   }
  // }
  // `;

  const FeedbackPrompt = `
  {{conversation}}

Based on the Interview Conversation between the assistant and the user, provide a comprehensive feedback analysis.

For each question asked by the assistant:
1. Briefly state the question asked.
2. Summarize the user's response.
3. Analyze the relevance of the user's response to the question. Indicate if the answer directly addresses the question, is partially relevant, or is irrelevant. Explain your reasoning briefly.

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
   - Observations on their engagement and communication style.

3. Provide a clear recommendation for hire (Yes/No/Maybe) in one line.

4. Provide a brief recommendation message (1-2 lines) explaining the reasoning behind the hire recommendation.

Give your response in JSON format:
{
  "feedback": {
    "questionAnalysis": [
      {
        "question": "<Question 1>",
        "userResponseSummary": "<Summary of user's answer>",
        "relevanceAnalysis": {
          "relevant": true/false/partially,
          "reasoning": "<Brief explanation of relevance>"
        }
      },
      {
        "question": "<Question 2>",
        "userResponseSummary": "<Summary of user's answer>",
        "relevanceAnalysis": {
          "relevant": true/false/partially,
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
    "recommendation": "Yes/No/Maybe",
    "recommendationMessage": "<1-2 line message explaining the recommendation>"
  }
}
  `;

  const finalPrompt = FeedbackPrompt.replace(
    "{{conversation}}",
    JSON.stringify(conv)
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

      const jsonText = rawText.replace(/```json|```/g, "").trim();
      const parsedFeedback = JSON.parse(jsonText);

      console.log("THis the feedback generated");
      console.log(parsedFeedback);

      // Save feedback to Firestore
      // const feedbackData = {
      //   interviewId: interviewId,
      //   userId: req.body.userId, // Assuming you send userId in the request body
      //   rating: parsedFeedback.feedback.rating,
      //   summary: parsedFeedback.feedback.summary,
      //   recommendation: parsedFeedback.feedback.Recommendation,
      //   recommendationMsg: parsedFeedback.feedback.RecommendationMsg,
      //   createdAt: admin.firestore.Timestamp.now(),
      // };
      // const docRef = await db.collection("feedbacks").add(feedbackData);
      // const feedbackId = docRef.id;
      // console.log("Feedback saved to Firebase with ID:", feedbackId);

      // res.status(200).json({ feedback: parsedFeedback.feedback, feedbackId }); // Return feedback and ID
      res.status(200).json({ feedback: parsedFeedback.feedback, convers : conv}); // Return feedback and ID
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
  console.log("body", req.body);
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
      //   coverImage: getRandomInterviewCover(),
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

app.listen(process.env.PORT, () => {
  console.log(`Server is running on http://localhost:${process.env.PORT}`);
});
