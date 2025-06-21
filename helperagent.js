const functions = require("firebase-functions");
const { OpenAI } = require("openai");
import dotenv from 'dotenv';
const cors = require("cors")({ origin: true });

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


exports.CoachAgentHissan = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { coachId, pti, message } = req.body;
      if (!coachId || !message) {
        console.error("THESE PARAMETERS ARE NEEDED HISSAN MY BOY")
      }

      const parameter_to_response_api = {
        model: "gpt-4o-mini",
        input: message,
        store: true,
      }

      if (pti) {
        parameter_to_response_api.previous_response_id = pti
      }
      else {
        const coach_collection = db.collection('coaches').doc(coachId);
        const coach_doc_data = await coach_collection.get()
        const coach_data = coach_doc_data.data();
        const instructions_and_personality = `Your instructions as coach are: ${coach_data.instructions} and your personality is: ${coach_data.personality}.`
        parameter_to_response_api.instructions = instructions_and_personality;
      }

      const response = await openai.responses.create(parameter_to_response_api)
      return res.status(200).json({
        responseId: response.id,  // Client saves this for next call
        assistantReply: response.output_text || "[No response]"
      });
    } catch (error) {
      console.error("❌ Error:", error);
      return res.status(500).json({
        error: "Internal server error",
        details: error.message
      })
    }
  })
})

// exports.helperAgent = functions.https.onRequest((req, res) => {
//   cors(req, res, async () => {
//     try {
//       const { assistantId, threadId, message, initialInstructions } = req.body;

//       // Validate input
//       if (!assistantId || !message) {
//         return res.status(400).json({
//           error: "Missing required fields: 'assistantId' and 'message' are required.",
//         });
//       }

//       let currentThreadId;

//       // Check if threadId is valid (must start with "thread_")
//       if (threadId && typeof threadId === "string" && threadId.startsWith("thread_")) {
//         currentThreadId = threadId;
//       } else {
//         // Create a new thread if none provided
//         const thread = await openai.beta.threads.create();
//         currentThreadId = thread.id;

//         // Send initial session instructions as the first message
//         if (initialInstructions) {
//           await openai.beta.threads.messages.create(currentThreadId, {
//             role: "user",
//             content: `[Session Instructions]\n${initialInstructions}`,
//           });
//         }
//       }

//       // Send user's message
//       await openai.beta.threads.messages.create(currentThreadId, {
//         role: "user",
//         content: message,
//       });

//       // Run the assistant
//       const run = await openai.beta.threads.runs.create(currentThreadId, {
//         assistant_id: assistantId,
//       });

//       // Poll until assistant finishes
//       let status = run.status;
//       while (status !== "completed" && status !== "failed") {
//         await new Promise(resolve => setTimeout(resolve, 1000));
//         const check = await openai.beta.threads.runs.retrieve(currentThreadId, run.id);
//         status = check.status;
//       }

//       if (status === "failed") {
//         return res.status(500).json({ error: "Assistant run failed." });
//       }

//       // Get assistant reply
//       const messages = await openai.beta.threads.messages.list(currentThreadId);
//       const reply = messages.data.find(m => m.role === "assistant");
//       const assistantReply = reply?.content[0]?.text?.value ?? "[No reply received]";

//       return res.status(200).json({
//         threadId: currentThreadId,
//         assistantReply,
//       });

//     } catch (error) {
//       console.error("❌ Error in helperAgent:", error);
//       return res.status(500).json({
//         error: "Internal server error",
//         details: error.message,
//       });
//     }
//   });
// });
