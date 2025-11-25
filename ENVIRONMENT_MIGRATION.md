# Environment Variables Migration Summary

This document summarizes the migration of hardcoded values to environment variables across the MediScan project.

## Changes Made

### 1. Backend (`/Backend`)

#### New Environment Variables Added:
- `DB_SERVER_SELECTION_TIMEOUT=5000` - Database connection timeout
- `DB_SOCKET_TIMEOUT=45000` - Database socket timeout  
- `REDIS_RETRY_DELAY=3000` - Redis retry delay
- `REQUEST_BODY_LIMIT=10mb` - Request body size limit
- `RATE_LIMIT_WINDOW_MS=900000` - Rate limiting window (15 minutes)
- `RATE_LIMIT_MAX_REQUESTS=100` - Max requests per window
- `RATE_LIMIT_RETRY_AFTER=900` - Rate limit retry after seconds
- `ACCOUNT_LOCK_DURATION=7200000` - Account lock duration (2 hours)
- `FILE_RETENTION_DEFAULT=31536000000` - Default file retention (1 year)
- `FILE_RETENTION_EXTENDED=220752000000` - Extended file retention (7 years)
- `AUDIT_LOG_RETENTION=220752000000` - Audit log retention (7 years)
- `LOG_MAX_SIZE=10485760` - Log file max size

#### Files Updated:
- `src/config/db.js` - Database timeouts
- `src/config/redis.js` - Redis retry delay
- `src/server.js` - Request body limits
- `src/middleware/rateLimiting.js` - Rate limiting configuration
- `src/models/User.js` - Account lock duration
- `src/models/File.js` - File retention policies
- `src/models/AuditLog.js` - Audit log retention
- `src/utils/logger.js` - Log file size

### 2. React Native App (`/MediScan`)

#### New Environment Variables Added:
- `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.12:3000/api/v1` - API base URL
- `EXPO_PUBLIC_API_TIMEOUT=30000` - API request timeout
- `EXPO_PUBLIC_MAX_FILE_SIZE=16777216` - Max file upload size
- `EXPO_PUBLIC_HEALTH_CHECK_TIMEOUT=5000` - Health check timeout
- `EXPO_PUBLIC_TEXT_EXTRACTION_MODEL=google/gemma-2-27b-it` - AI model name
- `EXPO_PUBLIC_MAX_TOKENS=2000` - Max tokens for AI processing
- `EXPO_PUBLIC_TEMPERATURE=0.1` - AI model temperature
- `EXPO_PUBLIC_DEFAULT_LOADING_DURATION=5000` - Loading screen duration

#### Files Updated:
- `src/services/AuthService.js` - API configuration and timeouts
- `src/services/FileService.js` - Max file size
- `src/services/TextExtractionService.js` - AI model configuration
- `src/screens/LoadingScreen.js` - Loading duration
- `src/screens/UploadScreen.js` - AI model reference

### 3. Flask AI Service (`/flask-ai-service`)

#### Environment Variables Already Used:
The Flask service was already well-configured with environment variables. Minor updates:
- `LOG_FILE` - Log file name (was hardcoded)
- `MAX_CONTENT_LENGTH` - Max content length (already configurable)

### 4. Test Files

#### Updated Files:
- `test-auth.js` - Now uses `API_BASE_URL` environment variable
- `test-registration.js` - Now uses `API_BASE_URL` environment variable
- Both files now load environment variables with `require('dotenv').config()`

### 5. Git Ignore Configuration

#### Added .gitignore files:
- `/Backend/.gitignore` - Ignores .env files, node_modules, logs, uploads
- `/flask-ai-service/.gitignore` - Ignores .env files, Python cache, models, logs
- `/.gitignore` - Root level ignore for .env files and common artifacts
- Updated `/MediScan/.gitignore` - Added explicit .env ignore

#### Security Improvements:
- All `.env` files are now properly ignored by git
- Sensitive configuration is externalized from source code
- Example files (`.env.example`) provide templates without sensitive data

## Benefits

1. **Security**: Sensitive data like API keys, secrets, and database URLs are no longer in source code
2. **Flexibility**: Different environments can use different configurations without code changes
3. **Maintainability**: Configuration changes don't require code deployments
4. **Best Practices**: Follows the 12-factor app methodology for configuration management

## Usage

1. Copy `.env.example` files to `.env` in each directory
2. Update the values in `.env` files with your specific configuration
3. Ensure `.env` files are never committed to version control
4. For production deployment, set environment variables through your deployment platform

## Files with Hardcoded Values Remaining

Most hardcoded values have been moved to environment variables. Any remaining hardcoded values are either:
- Constants that should not change (like algorithm parameters)
- Default values that are reasonable for all environments
- Values that are part of the application logic rather than configuration