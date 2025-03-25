require('dotenv').config({ path: './.env' }); // Load .env.local file
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
// Replace with your service account key file path

// const serviceAccount = require('./firebase.json');

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Handle newlines
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_cert_url,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_cert_url,
  universe_domain : process.env.universe_domain
};

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_AI_APIKEY);

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });



admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();

app.use(cors());
app.use(express.json());

   
app.get('/api/users', async (req, res) => {
    try {
      const usersCollection = await db.collection('users').get();
      const users = usersCollection.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

app.post('/api',async (req,res)=>{
    const {type,role,level,techstack,amount,userid} = req.body;

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
        console.log("Content Parts:", questions.response.candidates[0].content.parts);
        
        const jsonString = questions.response.candidates[0].content.parts[0].text;
        
        // // Inspect before parsing

        // console.log("JSON String:", jsonString); 
    
        // Parse the JSON string to get the questions array
        const parsedQuestions = JSON.parse(jsonString);

    
        const interview = {
          role: role,
          type: type,
          level: level,
          techstack: techstack.split(","),
          questions: parsedQuestions,
          userId: userid,
          finalized: true,
        //   coverImage: getRandomInterviewCover(),
          createdAt: new Date().toISOString(),
        };
    
        await db.collection("interviews").add(interview);
    
        return res.status(200).json({ success: true,interview});
      } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ success: false, error: error.message });

      }



    // res.json({message:"data recived"})
})

app.listen(process.env.PORT ,()=>{
    console.log(`Server is running on http://localhost:${process.env.PORT}`)
})
