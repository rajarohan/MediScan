#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');

async function testRegistration() {
  try {
    console.log('Testing registration endpoint...');
    
    const response = await axios.post(`${process.env.API_BASE_URL || 'http://localhost:3000/api/v1'}/auth/register`, {
      name: 'Test User',
      email: 'test@example.com',
      password: 'TestPass123!'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Registration successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Registration failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
  }
}

async function testLogin() {
  try {
    console.log('\nTesting login endpoint...');
    
    const response = await axios.post(`${process.env.API_BASE_URL || 'http://localhost:3000/api/v1'}/auth/login`, {
      email: 'test@example.com',
      password: 'TestPass123!'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Login successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Login failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
  }
}

// Run tests
testRegistration().then(() => testLogin());