
const axios = require('axios');

async function testTaskCreate() {
    try {
        console.log('Calling POST http://localhost:5000/tasks (JSON mode) ...');

        const payload = {
            file_urls: ['https://example.com/image1.jpg'],
            requirements: 'Test task from script',
            shot_count: '4',
            layout_mode: 'Individual',
            scene: 'Auto',
            resolution: '2K'
        };

        // Need to add mock headers if required, e.g. x-api-key?
        // Checking Controller: config uses headers. But they are optional fallbacks?
        // If config is missing, TaskService might complain?
        // Let's try without headers first.

        const res = await axios.post('http://localhost:5000/tasks', payload);
        console.log('✅ Status:', res.status);
        console.log('Task ID:', res.data.id);
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testTaskCreate();
