import { OpenAI } from 'openai';

class TextExtractionService {
  constructor() {
    this.client = null;
  }

  /**
   * Initialize OpenAI client lazily when first needed
   */
  initializeClient() {
    if (!this.client) {
      const apiKey = process.env.EXPO_PUBLIC_HF_TOKEN;
      
      if (!apiKey || apiKey === 'your_hugging_face_token_here' || apiKey.trim() === '') {
        console.warn('EXPO_PUBLIC_HF_TOKEN not configured. Text extraction will be disabled.');
        return false;
      }

      this.client = new OpenAI({
        baseURL: "https://router.huggingface.co/v1",
        apiKey: apiKey,
        dangerouslyAllowBrowser: true // Allow usage in React Native
      });
    }
    return true;
  }

  /**
   * Extract text from image using OpenAI-compatible API
   * @param {string} imageUri - The URI of the image to analyze
   * @param {string} customPrompt - Custom prompt for text extraction (optional)
   * @returns {Promise<Object>} Result object with extracted text
   */
  async extractTextFromImage(imageUri, customPrompt = null) {
    try {
      // Initialize client if needed
      if (!this.initializeClient()) {
        return {
          success: false,
          error: 'Text extraction service not configured. Please set EXPO_PUBLIC_HF_TOKEN environment variable.',
          extractedText: '',
          confidenceScore: 0
        };
      }

      console.log('Starting text extraction for image:', imageUri);

      // Convert local image URI to base64 if needed
      let imageUrl = imageUri;
      
      // For local images, we need to convert to base64
      if (imageUri.startsWith('file://') || imageUri.startsWith('/')) {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const base64 = await this.blobToBase64(blob);
        imageUrl = base64;
      }

      const defaultPrompt = "Extract all text content from this medical document or report. Provide the text in a structured format, preserving the original layout and organization. If this is a medical report, identify key sections like patient information, diagnosis, test results, etc.";

      const prompt = customPrompt || defaultPrompt;

      const chatCompletion = await this.client.chat.completions.create({
        model: process.env.EXPO_PUBLIC_TEXT_EXTRACTION_MODEL || "google/gemma-2-27b-it",
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
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        max_tokens: parseInt(process.env.EXPO_PUBLIC_MAX_TOKENS) || 2000,
        temperature: parseFloat(process.env.EXPO_PUBLIC_TEMPERATURE) || 0.1, // Low temperature for more consistent text extraction
      });

      const extractedText = chatCompletion.choices[0].message.content;

      console.log('Text extraction completed successfully');

      return {
        success: true,
        extractedText,
        model: process.env.EXPO_PUBLIC_TEXT_EXTRACTION_MODEL || "google/gemma-2-27b-it",
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      console.error('Text extraction error:', error);

      // Check if it's a network/API error
      if (error.code === 'NETWORK_ERROR' || error.message.includes('fetch')) {
        return {
          success: false,
          error: 'network',
          message: 'Network error occurred. Please check your internet connection.',
          originalError: error.message,
        };
      }

      // Check if it's an API key error
      if (error.status === 401 || error.message.includes('unauthorized')) {
        return {
          success: false,
          error: 'auth',
          message: 'API authentication failed. Please check your API key configuration.',
          originalError: error.message,
        };
      }

      // Check if it's a quota/rate limit error
      if (error.status === 429) {
        return {
          success: false,
          error: 'quota',
          message: 'API rate limit exceeded. Please try again later.',
          originalError: error.message,
        };
      }

      return {
        success: false,
        error: 'unknown',
        message: 'Failed to extract text from image. Please try again.',
        originalError: error.message,
      };
    }
  }

  /**
   * Convert blob to base64 string
   * @param {Blob} blob - Blob to convert
   * @returns {Promise<string>} Base64 string
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Analyze image and determine if it's a medical document
   * @param {string} imageUri - The URI of the image to analyze
   * @returns {Promise<Object>} Result object with analysis
   */
  async analyzeImageType(imageUri) {
    try {
      const result = await this.extractTextFromImage(
        imageUri,
        "Analyze this image and determine: 1) Is this a medical document or report? 2) What type of medical document is it (prescription, lab report, X-ray, etc.)? 3) What is the main content or purpose? Provide a brief summary."
      );

      if (result.success) {
        return {
          success: true,
          analysis: result.extractedText,
          isMedicalDocument: result.extractedText.toLowerCase().includes('medical') ||
                            result.extractedText.toLowerCase().includes('patient') ||
                            result.extractedText.toLowerCase().includes('doctor') ||
                            result.extractedText.toLowerCase().includes('hospital'),
        };
      }

      return result;
    } catch (error) {
      console.error('Image analysis error:', error);
      return {
        success: false,
        message: 'Failed to analyze image type',
        error: error.message,
      };
    }
  }

  /**
   * Process medical document with specialized prompts
   * @param {string} imageUri - The URI of the image to process
   * @param {string} documentType - Type of medical document
   * @returns {Promise<Object>} Result object with structured extraction
   */
  async processMedicalDocument(imageUri, documentType = 'general') {
    const prompts = {
      prescription: "Extract all information from this prescription including: patient name, doctor name, medications (name, dosage, frequency), pharmacy information, date, and any special instructions.",
      lab_report: "Extract all information from this lab report including: patient details, test names, values, reference ranges, abnormal indicators, date of collection, and interpreting physician.",
      xray: "Describe this X-ray or medical imaging report including: patient information, study type, findings, impression, and radiologist details.",
      general: "Extract all text and information from this medical document, organizing it by sections such as patient information, diagnosis, treatment, medications, and recommendations."
    };

    const prompt = prompts[documentType] || prompts.general;
    return await this.extractTextFromImage(imageUri, prompt);
  }
}

// Export singleton instance
export default new TextExtractionService();