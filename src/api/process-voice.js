import { processTranscriptWithGemini } from '../gemini.js';

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("SERVER ERROR: GEMINI_API_KEY is not set!");
      return response.status(500).json({ error: 'API key is not configured on the server.' });
    }
    const { transcript, language } = request.body;
    if (!transcript) {
      return response.status(400).json({ error: 'Missing transcript.' });
    }
    const commandData = await processTranscriptWithGemini(transcript, language, apiKey);
    return response.status(200).json(commandData);
  } catch (error) {
    console.error('SERVER ERROR in /api/process-voice:', error);
    return response.status(500).json({ error: 'Error processing command.' });
  }
}