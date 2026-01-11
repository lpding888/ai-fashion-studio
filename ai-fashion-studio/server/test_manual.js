const axios = require('axios');

const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const MODEL = 'gemini-2.5-pro';
const GATEWAY_BASE = 'https://api.vectorengine.ai';

const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

async function test() {
    console.log('Testing connection to:', GATEWAY_BASE);
    console.log('Model:', MODEL);
    console.log('Key:', API_KEY.substring(0, 10) + '...');

    const client = axios.create({
        timeout: 30000,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    // TEST 1: v1beta generateContent (Native Google)
    // Construct URL: https://api.vectorengine.ai/v1beta/models/gemini-2.5-pro:generateContent?key=...
    const url1 = `${GATEWAY_BASE}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    console.log('\n[Test 1] Google Native:', url1);
    try {
        const res = await client.post(url1, {
            contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
            generationConfig: { maxOutputTokens: 100 },
            safetySettings: SAFETY_SETTINGS
        }); // No Auth header, key in URL
        console.log('SUCCESS:', res.status, JSON.stringify(res.data).substring(0, 200));
    } catch (e) {
        console.log('FAILED:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    }

    // TEST 2: v1beta generateContent with Bearer
    const url2 = `${GATEWAY_BASE}/v1beta/models/${MODEL}:generateContent`;
    console.log('\n[Test 2] Google Native (Bearer):', url2);
    try {
        const res = await client.post(url2, {
            contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
            generationConfig: { maxOutputTokens: 100 },
            safetySettings: SAFETY_SETTINGS
        }, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        console.log('SUCCESS:', res.status, JSON.stringify(res.data).substring(0, 200));
    } catch (e) {
        console.log('FAILED:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    }

    // TEST 3: v1 chat completions (OpenAI Compatible)
    const url3 = `${GATEWAY_BASE}/v1/chat/completions`;
    console.log('\n[Test 3] OpenAI Compatible:', url3);
    try {
        const res = await client.post(url3, {
            model: MODEL,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100
        }, {
            headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        console.log('SUCCESS:', res.status, JSON.stringify(res.data).substring(0, 200));
    } catch (e) {
        console.log('FAILED:', e.response?.status, JSON.stringify(e.response?.data || e.message));
    }
}

test();
