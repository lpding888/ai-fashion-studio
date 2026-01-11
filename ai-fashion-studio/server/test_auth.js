const axios = require('axios');

const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const MODEL = 'gemini-2.5-pro';
const GATEWAY_BASE = 'https://api.vectorengine.ai';

async function testAuth() {
    console.log('--- Testing OpenAI Endpoint Auth ---');
    const url = `${GATEWAY_BASE}/v1/chat/completions`;

    // 1. Test Bearer Header (Standard OpenAI)
    console.log('\n[1] Testing Authorization: Bearer ...');
    try {
        const res = await axios.post(url, {
            model: MODEL,
            messages: [{ role: 'user', content: 'hi' }]
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('SUCCESS (Bearer):', res.status, res.data.choices?.[0]?.message?.content);
    } catch (e) {
        console.log('FAILED (Bearer):', e.response?.status, JSON.stringify(e.response?.data));
    }

    // 2. Test Key in URL (Google Style but on OpenAI endpoint)
    console.log('\n[2] Testing ?key=... in URL ...');
    try {
        const res = await axios.post(`${url}?key=${API_KEY}`, {
            model: MODEL,
            messages: [{ role: 'user', content: 'hi' }]
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('SUCCESS (Query Param):', res.status, res.data.choices?.[0]?.message?.content);
    } catch (e) {
        console.log('FAILED (Query Param):', e.response?.status, JSON.stringify(e.response?.data));
    }
}

testAuth();
