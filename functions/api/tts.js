import { getSessionUser, json, unauthorized } from './_auth.js';

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env.DB);
  if (!user) return unauthorized();

  const apiKey = env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    return json({ error: 'Google Cloud TTS not configured on server. Ask your admin to set GOOGLE_CLOUD_TTS_API_KEY.' }, 503);
  }

  const { text, language_code = 'en-GB', pitch = 0.85, speaking_rate = 0.92 } = await request.json();
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return json({ error: 'Text required' }, 400);
  }

  try {
    // Clean up text for TTS (remove markdown, trim)
    const cleanText = text.replace(/[*_`#]/g, '').replace(/\n+/g, ' ').trim();

    // Call Google Cloud Text-to-Speech API
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: cleanText },
        voice: {
          language_code: language_code,
          name: 'en-GB-Neural2-C', // JARVIS-like voice: British, male, sophisticated
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: pitch - 1, // Google API expects -20 to 20, where 0 is neutral. Convert from 0.85 to -0.15
          speakingRate: speaking_rate,
          volumeGainDb: 0,
        },
      }),
      urlSearchParams: new URLSearchParams({ key: apiKey }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Google Cloud TTS API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.audioContent) {
      throw new Error('No audio content returned from Google Cloud TTS');
    }

    // Return base64-encoded audio and metadata
    return json({
      ok: true,
      audioContent: data.audioContent, // base64-encoded MP3
      audioEncoding: 'MP3',
    });
  } catch (e) {
    console.error('TTS Error:', e.message);
    return json({ error: `TTS error: ${e.message}` }, 500);
  }
}
