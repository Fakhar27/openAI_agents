const functions = require('firebase-functions');
const axios = require('axios'); // HTTP client for fetching XML
const xml2js = require('xml2js'); // XML to JSON parser
const admin = require('firebase-admin');
import OpenAI from 'openai';
// import axios from 'axios';

admin.initializeApp();

const openai = new OpenAI({
  apiKey: ""
});


const calculateUid = (year, month, day) => {
  const startingUids = {
    1: 1, 2: 28, 3: 54, 4: 80, 5: 106,
    6: 133, 7: 158, 8: 185, 9: 212, 10: 237
  };
  const startUid = startingUids[month];
  if (!startUid) {
    throw new Error(`Starting UID not defined for month ${month}`);
  }
  let dayOffset = 0;
  for (let d = 1; d < day; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() !== 0) { // 0 is Sunday
      dayOffset++;
    }
  }
  return startUid + dayOffset;
};

async function downloadBoePdf(year, month, day) {
  try {
    const uid = calculateUid(year, month, day);
    const url = `https://www.boe.es/boe/dias/${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/pdfs/BOE-S-${year}-${uid}.pdf`;

    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });

    if (response.status === 200) {
      return response.data;
    }
    throw new Error(`Failed to download PDF. Status code: ${response.status}`);
  } catch (error) {
    console.error('Error downloading BOE PDF:', error);
    throw error;
  }
}

async function updateVectorStore(vectorStoreId, pdfData, todayFilename) {
  try {
    const file = await openai.files.create({
      file: Buffer.from(pdfData),
      purpose: 'assistants'
    });

    await openai.beta.vectorStores.files.createAndPoll(
      vectorStoreId,
      { file_id: file.id }
    );

    return true;
  } catch (error) {
    console.error('Error updating vector store:', error);
    throw error;
  }
}

exports.startAssistant = functions.https.onRequest(async (req, res) => {
  try {
    const { vectorStoreId, assistantId } = req.body;

    if (!vectorStoreId || !assistantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // ***** NEED FIXING ******
    // const today = new Date();
    // if (today.getDay() === 0) {
    //   return res.status(200).json({
    //     success: false,
    //     message: "Today is Sunday. No publication available.",
    //     vectorStoreId,
    //     assistantId
    //   });
    // }
    const today = new Date(2024, 9, 31); // October 31, 2024 (Note: Month is 0-indexed, so 9 represents October)
    if (today.getDay() === 0) {
      return res.status(200).json({
        success: false,
        message: "Today is Sunday. No publication available.",
        vectorStoreId,
        assistantId
      });
    }

    const todayFilename = `BOE-S-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}.pdf`;

    // Check if file already exists in OpenAI storage
    const filesList = await openai.files.list();
    const existingFile = filesList.data.find(f => f.filename === todayFilename);

    if (existingFile) {
      try {
        await openai.beta.vectorStores.files.createAndPoll(
          vectorStoreId,
          { file_id: existingFile.id }
        );
      } catch (error) {
        console.log('File might already be in vector store');
      }
      return res.status(200).json({
        success: true,
        message: 'File already exists and processed',
        vectorStoreId,
        assistantId
      });
    }

    const pdfContent = await downloadBoePdf(
      today.getFullYear(),
      today.getMonth() + 1,
      today.getDate()
    );

    await updateVectorStore(vectorStoreId, pdfContent, todayFilename);

    return res.status(200).json({
      success: true,
      vectorStoreId,
      assistantId
    });

  } catch (error) {
    console.error('Error in startAssistant:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// startOrRetrieveConversation.js
// exports.startOrRetrieveConversation = functions.https.onRequest(async (req, res) => {
//   try {
//     const { assistantId, vectorStoreId, message, threadId } = req.body;

//     if (!assistantId || !vectorStoreId || !message) {
//       return res.status(400).json({
//         success: false,
//         error: 'Missing required parameters'
//       });
//     }

//     let currentThreadId = threadId;

//     try {
//       if (!currentThreadId) {
//         const thread = await openai.beta.threads.create();
//         currentThreadId = thread.id;
//       }

//       await openai.beta.threads.messages.create(currentThreadId, {
//         role: "user",
//         content: message
//       });

//       const run = await openai.beta.threads.runs.create(currentThreadId, {
//         assistant_id: assistantId
//       });

//       let runStatus = await openai.beta.threads.runs.retrieve(currentThreadId, run.id);
//       let attempts = 0;
//       const maxAttempts = 30; // Maximum 30 seconds wait

//       while (runStatus.status !== "completed" && attempts < maxAttempts) {
//         if (runStatus.status === "failed") {
//           throw new Error("Run failed");
//         }
//         await new Promise(resolve => setTimeout(resolve, 1000));
//         runStatus = await openai.beta.threads.runs.retrieve(currentThreadId, run.id);
//         attempts++;
//       }

//       if (attempts >= maxAttempts) {
//         throw new Error("Response timeout");
//       }

//       const messages = await openai.beta.threads.messages.list(currentThreadId);
//       const lastMessage = messages.data[0];

//       return res.status(200).json({
//         success: true,
//         response: lastMessage.content[0].text.value,
//         threadId: currentThreadId
//       });

//     } catch (error) {
//       console.error('Error in conversation processing:', error);
//       throw error;
//     }

//   } catch (error) {
//     console.error('Error in startOrRetrieveConversation:', error);
//     return res.status(500).json({
//       success: false,
//       error: error.message
//     });
//   }
// });