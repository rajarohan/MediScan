const { OpenAI } = require('openai');
const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class BackendTextExtractionService {
    constructor() {
        // Initialize OpenAI client with Hugging Face router
        this.client = new OpenAI({
            baseURL: "https://router.huggingface.co/v1",
            apiKey: process.env.HF_TOKEN,
        });
    }

    /**
     * Extract text from image file
     * @param {string} filePath - Path to the image file
     * @param {string} customPrompt - Custom prompt for text extraction
     * @returns {Promise<Object>} Result object with extracted text
     */
    async extractTextFromImage(filePath, customPrompt = null) {
        try {
            logger.info('Starting backend text extraction for file:', filePath);

            // Check if file exists
            const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
            if (!fileExists) {
                throw new Error('File not found');
            }

            // Read file and convert to base64
            const fileBuffer = await fs.readFile(filePath);
            const base64Image = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;

            const defaultPrompt = "Extract all text content from this medical document or report. Provide the text in a structured format, preserving the original layout and organization. If this is a medical report, identify key sections like patient information, diagnosis, test results, etc.";

            const prompt = customPrompt || defaultPrompt;

            const chatCompletion = await this.client.chat.completions.create({
                model: "google/gemma-2-27b-it",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt,
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: base64Image,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 2000,
                temperature: 0.1, // Low temperature for consistent text extraction
            });

            const extractedText = chatCompletion.choices[0].message.content;

            logger.info('Backend text extraction completed successfully');

            return {
                success: true,
                extractedText,
                model: "google/gemma-2-27b-it",
                timestamp: new Date().toISOString(),
                extractionMethod: 'backend',
            };

        } catch (error) {
            logger.error('Backend text extraction error:', error);

            // Handle different types of errors
            if (error.status === 401) {
                return {
                    success: false,
                    error: 'auth',
                    message: 'API authentication failed',
                    extractionMethod: 'backend',
                };
            }

            if (error.status === 429) {
                return {
                    success: false,
                    error: 'quota',
                    message: 'API rate limit exceeded',
                    extractionMethod: 'backend',
                };
            }

            return {
                success: false,
                error: 'unknown',
                message: error.message || 'Failed to extract text from image',
                extractionMethod: 'backend',
            };
        }
    }

    /**
     * Analyze image and determine document type
     * @param {string} filePath - Path to the image file
     * @returns {Promise<Object>} Result object with analysis
     */
    async analyzeDocumentType(filePath) {
        try {
            const result = await this.extractTextFromImage(
                filePath,
                "Analyze this image and determine: 1) Is this a medical document or report? 2) What type of medical document is it (prescription, lab report, X-ray, etc.)? 3) What is the main content or purpose? Provide a brief summary."
            );

            if (result.success) {
                return {
                    success: true,
                    analysis: result.extractedText,
                    isMedicalDocument: this.isMedicalContent(result.extractedText),
                    documentType: this.classifyDocumentType(result.extractedText),
                    extractionMethod: 'backend',
                };
            }

            return result;
        } catch (error) {
            logger.error('Backend document analysis error:', error);
            return {
                success: false,
                message: 'Failed to analyze document type',
                error: error.message,
                extractionMethod: 'backend',
            };
        }
    }

    /**
     * Check if content is medical-related
     * @param {string} text - Text to analyze
     * @returns {boolean} True if medical content detected
     */
    isMedicalContent(text) {
        const medicalKeywords = [
            'medical', 'patient', 'doctor', 'physician', 'hospital', 'clinic',
            'prescription', 'medication', 'diagnosis', 'treatment', 'symptoms',
            'lab', 'test', 'results', 'blood', 'urine', 'x-ray', 'mri', 'ct',
            'report', 'examination', 'healthcare', 'health', 'medicine'
        ];

        const lowerText = text.toLowerCase();
        return medicalKeywords.some(keyword => lowerText.includes(keyword));
    }

    /**
     * Classify document type based on extracted text
     * @param {string} text - Text to classify
     * @returns {string} Document type
     */
    classifyDocumentType(text) {
        const lowerText = text.toLowerCase();

        if (lowerText.includes('prescription') || lowerText.includes('rx')) {
            return 'prescription';
        }
        if (lowerText.includes('lab') && (lowerText.includes('result') || lowerText.includes('report'))) {
            return 'lab_report';
        }
        if (lowerText.includes('x-ray') || lowerText.includes('radiolog')) {
            return 'xray';
        }
        if (lowerText.includes('discharge') && lowerText.includes('summary')) {
            return 'discharge_summary';
        }
        if (lowerText.includes('insurance') || lowerText.includes('coverage')) {
            return 'insurance';
        }

        return 'general_medical';
    }
}

// Export singleton instance
module.exports = new BackendTextExtractionService();