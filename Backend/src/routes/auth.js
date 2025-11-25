const express = require('express');
const { 
    register, 
    login, 
    refreshToken, 
    logout, 
    logoutAll, 
    getProfile 
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { 
    authLimiter, 
    passwordResetLimiter, 
    apiLimiter 
} = require('../middleware/rateLimiting');

const router = express.Router();

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', authLimiter, register);

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user and return tokens
 * @access Public
 */
router.post('/login', authLimiter, login);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post('/refresh', apiLimiter, refreshToken);

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user and invalidate refresh token
 * @access Private
 */
router.post('/logout', authenticate, logout);

/**
 * @route POST /api/v1/auth/logout-all
 * @desc Logout user from all devices
 * @access Private
 */
router.post('/logout-all', authenticate, logoutAll);

/**
 * @route GET /api/v1/auth/profile
 * @desc Get current user profile
 * @access Private
 */
router.get('/profile', authenticate, getProfile);

module.exports = router;