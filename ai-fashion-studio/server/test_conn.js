const axios = require('axios');

const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const MODEL = 'gemini-2.5-pro';
const GATEWAY = 'https://api.vectorengine.ai/v1';

async function test() {
    console.log('Testing with key:', API_KEY.substring(0, 10) + '...');

    // Strategy 1: Google Native (v1beta)
    // https://api.vectorengine.ai/v1beta/models/gemini-2.5-pro:generateContent
    try {
        const url1 = `https://api.vectorengine.ai/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
        console.log('\n--- Strategy 1: Google Native ---');
        console.log('URL:', url1);

        const res1 = await axios.post(url1, {
            contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
            generationConfig: { maxOutputTokens: 10 }
        }, {
            headers: { 'Content-Type': 'application/json' }, // removing Authorization header for key param test
            timeout: 10000
        });
        console.log('Strategy 1 SUCCESS:', res1.data);
    } catch (e) {
        console.log('Strategy 1 FAILED:', e.response?.status, e.response?.data || e.message);
    }

    // Strategy 2: Google Native (v1beta) with Bearer Token
    try {
        const url2 = `https://api.vectorengine.ai/v1beta/models/${MODEL}:generateContent`;
        console.log('\n--- Strategy 2: Google Native (Bearer) ---');
        console.log('URL:', url2);

        const res2 = await axios.post(url2, {
            contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
            generationConfig: { maxOutputTokens: 10 }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            timeout: 10000
        });
        console.log('Strategy 2 SUCCESS:', res2.data);
    } catch (e) {
        console.log('Strategy 2 FAILED:', e.response?.status, e.response?.data || e.message);
    }

    // Strategy 3: OpenAI Compatible
    try {
        const url3 = `https://api.vectorengine.ai/v1/chat/completions`;
        console.log('\n--- Strategy 3: OpenAI Compatible ---');
        console.log('URL:', url3);

        const res3 = await axios.post(url3, {
            model: MODEL,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 10
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            timeout: 10000
        });
        console.log('Strategy 3 SUCCESS:', res3.data);
    } catch (e) {
        console.log('Strategy 3 FAILED:', e.response?.status, e.response?.data || e.message);
    }
}

test();
