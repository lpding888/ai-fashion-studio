
const axios = require('axios');

async function testEndpoint() {
    try {
        console.log('Calling http://localhost:5000/cos/credentials ...');
        const res = await axios.post('http://localhost:5000/cos/credentials', {
            userId: 'test-user'
        });
        console.log('✅ Status:', res.status);
        console.log('Response:', res.data);
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testEndpoint();
