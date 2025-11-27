# MediScan - Complete Medical Document Processing System

## 🏥 System Overview

MediScan is a comprehensive medical document processing system with secure OCR, AI-powered text extraction, and medical entity recognition. The system provides a complete solution for digitizing and analyzing medical documents with clinician-friendly summaries.

### Components
1. **React Native Mobile App** - Cross-platform mobile interface with camera and document upload
2. **Node.js Backend API** - Secure REST API with JWT authentication and file management
3. **Flask AI Service** - Advanced OCR, medical NLP, and entity extraction service

## 🚀 Quick Start

### One-Command Setup
```bash
./setup.sh      # Initial setup and dependency installation
./start-all.sh  # Start all services
./health-check.sh  # Verify everything is working
```

### Manual Verification
- Backend API: http://localhost:3000/health
- AI Service: http://localhost:5001/health
- Mobile App: Expo Developer Tools

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Native  │    │   Node.js API   │    │  Flask AI Service│
│   Mobile App    │◄──►│    Backend      │◄──►│   (Python)      │
│                 │    │                 │    │                 │
│ • Authentication│    │ • JWT Auth      │    │ • OCR (Tesseract)│
│ • File Upload   │    │ • File Storage  │    │ • Medical NLP   │
│ • Results View  │    │ • API Gateway   │    │ • AI Analysis   │
│ • Progress Track│    │ • MongoDB       │    │ • Summarization │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Features

### Security & Compliance
- **HIPAA Compliant**: End-to-end encryption, audit logging, secure storage
- **JWT Authentication**: Secure token-based auth with refresh tokens
- **HMAC Signatures**: API request verification between services
- **Rate Limiting**: Protection against abuse and DoS attacks
- **Account Security**: Login attempt tracking, account lockouts

### File Processing
- **Multi-format Support**: PDF, JPEG, PNG, TIFF, BMP
- **OCR Processing**: High-accuracy text extraction with confidence scoring
- **Medical Entity Extraction**: Automated identification of:
  - Vital signs (blood pressure, heart rate, temperature)
  - Lab results (glucose, cholesterol, hemoglobin)
  - Medications and dosages
  - Diagnoses and procedures

### AI Analysis
- **Clinical Summaries**: Structured, clinician-friendly reports
- **Risk Assessment**: Automated flagging of abnormal values
- **Quality Metrics**: OCR confidence, extraction accuracy, document quality
- **Progress Tracking**: Real-time processing status updates

## Technical Stack

### Backend (Node.js)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with bcrypt password hashing
- **File Upload**: Multer with validation and security checks
- **Logging**: Winston with structured logging
- **Security**: Helmet, CORS, rate limiting
- **Monitoring**: Health checks, audit trails

### AI Service (Python/Flask)
- **OCR**: Tesseract with OpenCV preprocessing
- **NLP**: spaCy, transformers for medical entity extraction
- **Image Processing**: PIL, pdf2image, OpenCV
- **API**: Flask with HMAC authentication
- **Models**: Medical NER, clinical text analysis

### Mobile App (React Native)
- **Framework**: Expo React Native
- **Navigation**: React Navigation v7
- **UI Components**: React Native Paper, React Native Elements
- **State Management**: Context API with reducers
- **Storage**: Expo SecureStore for sensitive data
- **File Handling**: Expo DocumentPicker, ImagePicker

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.9+
- MongoDB 5.0+
- Redis (optional, for rate limiting)
- Tesseract OCR
- Expo CLI

### Backend Setup

```bash
cd Backend
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your configurations

# Start MongoDB
mongod

# Start development server
npm run dev
```

### AI Service Setup

```bash
cd flask-ai-service

# Create virtual environment
python -m venv mediscan_env
source mediscan_env/bin/activate  # On Windows: mediscan_env\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Tesseract OCR
# macOS: brew install tesseract
# Ubuntu: sudo apt-get install tesseract-ocr
# Windows: Download from GitHub releases

# Install spaCy model
python -m spacy download en_core_web_sm

# Set environment variables
cp .env.example .env
# Edit .env with your configurations

# Start service
python app.py
```

### Mobile App Setup

```bash
cd MediScan

# Install dependencies
npm install

# For iOS (macOS only)
cd ios && pod install && cd ..

# Start Expo development server
expo start
```

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### File Management Endpoints
- `POST /api/files/upload` - Upload and process document
- `GET /api/files` - List user files
- `GET /api/files/:id` - Get file details
- `GET /api/files/:id/status` - Get processing status
- `GET /api/files/:id/results` - Get analysis results
- `DELETE /api/files/:id` - Delete file

### Internal API (AI Service Communication)
- `POST /api/internal/ai/callback` - AI processing callback
- `GET /api/internal/health` - Service health check

### AI Service Endpoints
- `POST /internal/ai/process` - Process document
- `GET /health` - Health check

## Data Models

### User Model
```javascript
{
  name: String,
  email: String (unique),
  passwordHash: String,
  role: String (patient/clinician/admin),
  phoneNumber: String,
  dateOfBirth: Date,
  consentToProcess: Boolean,
  consentToStore: Boolean,
  refreshTokens: [String],
  loginAttempts: Number,
  lockUntil: Date,
  emailVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### File Model
```javascript
{
  userId: ObjectId,
  originalName: String,
  storedName: String,
  mimeType: String,
  size: Number,
  checksum: String,
  encryptionKey: String,
  processingStatus: String,
  accessLog: [Object],
  shareSettings: Object,
  retentionDate: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### ProcessingJob Model
```javascript
{
  fileId: ObjectId,
  userId: ObjectId,
  status: String,
  progress: Number,
  processingSteps: [Object],
  results: {
    ocrText: String,
    extractedEntities: Object,
    summary: Object,
    qualityMetrics: Object
  },
  error: Object,
  startedAt: Date,
  completedAt: Date
}
```

## Security Features

### Data Protection
- **Encryption**: AES-256 for file encryption, bcrypt for passwords
- **Secure Headers**: Helmet.js security headers
- **Input Validation**: Comprehensive validation and sanitization
- **SQL Injection Protection**: Mongoose ODM with parameterized queries
- **XSS Protection**: Content Security Policy and input sanitization

### Access Control
- **Role-based Access**: Patient, clinician, admin roles
- **Resource Ownership**: Users can only access their own files
- **API Rate Limiting**: Prevents abuse and DoS attacks
- **Account Lockouts**: Protection against brute force attacks

### Compliance
- **HIPAA Compliant**: Secure storage, access logging, data retention
- **Audit Logging**: Comprehensive activity tracking
- **Data Minimization**: Only collect necessary information
- **Right to Delete**: User data deletion on request

## Deployment

### Docker Deployment
```bash
# Build and run all services
docker-compose up -d

# Scale services
docker-compose up -d --scale flask-ai=3
```

### Environment Variables
```bash
# Backend
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/mediscan
JWT_SECRET=your-secret-key
AI_SERVICE_URL=http://localhost:5000
AI_SERVICE_SECRET=shared-secret

# AI Service
FLASK_ENV=production
PORT=5000
AI_SERVICE_SECRET=shared-secret
TEMP_DIR=/tmp/mediscan
OCR_LANGUAGE=eng
```

### Production Considerations
- **Load Balancing**: Use nginx or cloud load balancer
- **Database**: MongoDB Atlas or managed MongoDB
- **File Storage**: AWS S3 or Google Cloud Storage
- **Monitoring**: Application performance monitoring
- **Backup**: Automated database and file backups
- **SSL/TLS**: HTTPS with valid certificates

## Testing

### Backend Tests
```bash
cd Backend
npm test              # Unit tests
npm run test:integration  # Integration tests
npm run test:coverage    # Coverage report
```

### AI Service Tests
```bash
cd flask-ai-service
pytest               # Unit tests
pytest --cov        # Coverage report
```

### Mobile App Tests
```bash
cd MediScan
npm test            # Component tests
expo test           # End-to-end tests
```

## Monitoring & Logging

### Application Logs
- **Structured Logging**: JSON format with correlation IDs
- **Log Levels**: Error, warn, info, debug
- **Audit Trails**: User actions, file access, processing events

### Health Checks
- **API Health**: `/api/health` endpoint
- **AI Service Health**: `/health` endpoint
- **Database Connectivity**: Connection pool monitoring
- **External Dependencies**: Service availability checks

### Metrics
- **Processing Times**: Document processing latency
- **Success Rates**: OCR confidence, processing success
- **User Activity**: Upload frequency, error rates
- **System Resources**: CPU, memory, storage usage

## Troubleshooting

### Common Issues

1. **OCR Processing Fails**
   - Check Tesseract installation
   - Verify file format support
   - Review image quality and preprocessing

2. **Authentication Errors**
   - Verify JWT secret configuration
   - Check token expiration settings
   - Review CORS configuration

3. **File Upload Issues**
   - Check file size limits
   - Verify MIME type support
   - Review storage permissions

4. **AI Service Connectivity**
   - Verify HMAC signature configuration
   - Check network connectivity
   - Review service health endpoints

### Performance Optimization
- **Database Indexing**: Ensure proper MongoDB indexes
- **Caching**: Implement Redis caching for frequent queries
- **File Storage**: Use CDN for file serving
- **AI Processing**: Queue system for batch processing

## Contributing

1. Fork the repository
2. Create feature branch
3. Follow coding standards
4. Add comprehensive tests
5. Update documentation
6. Submit pull request

## License

This project is licensed under the MIT License - see LICENSE file for details.

## Support

For technical support and questions:
- Email: support@mediscan.com
- Documentation: https://docs.mediscan.com
- Issues: https://github.com/mediscan/issues