require('dotenv').config();
const axios = require('axios');

async function testRegistration() {
    try {
        console.log('Testing registration...');
        const response = await axios.post(`${process.env.API_BASE_URL || 'http://localhost:3000/api/v1'}/auth/register`, {
            name: 'Test User',
            email: 'testuser' + Date.now() + '@example.com', // Use unique email
            password: 'TestPass123!'
        });
        
        console.log('✅ Registration successful!');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.log('❌ Registration failed!');
        console.log('Status:', error.response?.status || 'No response');
        console.log('Error data:', JSON.stringify(error.response?.data, null, 2));
        console.log('Error message:', error.message);
        return false;
    }
}

testRegistration();