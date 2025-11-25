import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import AuthService from './AuthService';

const apiClient = AuthService.getApiClient();

class FileService {
  // Supported file types
  static SUPPORTED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/bmp',
    'application/pdf',
  ];

  // Maximum file size (16MB)
  static MAX_FILE_SIZE = parseInt(process.env.EXPO_PUBLIC_MAX_FILE_SIZE) || 16 * 1024 * 1024;

  // Pick document from device
  static async pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/tiff',
          'image/bmp',
          'application/pdf',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        // Validate file
        const validation = await this.validateFile(file);
        
        if (validation.valid) {
          return {
            success: true,
            file: {
              uri: file.uri,
              name: file.name,
              size: file.size,
              mimeType: file.mimeType,
              type: 'document',
            },
          };
        } else {
          return {
            success: false,
            message: validation.message,
          };
        }
      }

      return {
        success: false,
        message: 'No document selected',
      };
    } catch (error) {
      console.error('Document picker error:', error);
      return {
        success: false,
        message: 'Failed to pick document',
        error: error.message,
      };
    }
  }

  // Pick image from camera or gallery
  static async pickImage(fromCamera = false) {
    try {
      // Request permissions
      const permission = fromCamera 
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        return {
          success: false,
          message: `${fromCamera ? 'Camera' : 'Gallery'} permission is required`,
        };
      }

      const options = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      };

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        
        // Get file info
        const fileInfo = await FileSystem.getInfoAsync(image.uri);
        
        const file = {
          uri: image.uri,
          name: `image_${Date.now()}.jpg`,
          size: fileInfo.size,
          mimeType: 'image/jpeg',
          type: 'image',
        };

        // Validate file
        const validation = await this.validateFile(file);
        
        if (validation.valid) {
          return {
            success: true,
            file,
          };
        } else {
          return {
            success: false,
            message: validation.message,
          };
        }
      }

      return {
        success: false,
        message: 'No image selected',
      };
    } catch (error) {
      console.error('Image picker error:', error);
      return {
        success: false,
        message: 'Failed to pick image',
        error: error.message,
      };
    }
  }

  // Validate file
  static async validateFile(file) {
    try {
      // Check if file exists
      if (!file.uri) {
        return {
          valid: false,
          message: 'Invalid file',
        };
      }

      // Check file size
      if (file.size > this.MAX_FILE_SIZE) {
        return {
          valid: false,
          message: `File is too large. Maximum size is ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        };
      }

      // Check file type
      if (!this.SUPPORTED_TYPES.includes(file.mimeType)) {
        return {
          valid: false,
          message: 'Unsupported file type. Please select a PDF, JPEG, PNG, TIFF, or BMP file.',
        };
      }

      return {
        valid: true,
      };
    } catch (error) {
      console.error('File validation error:', error);
      return {
        valid: false,
        message: 'File validation failed',
      };
    }
  }

  // Upload file with extracted text
  static async uploadFileWithText(uploadData, onProgress = null) {
    try {
      const { file, extractedText, textExtractionTimestamp, textExtractionModel } = uploadData;
      
      console.log('Starting file upload with text extraction:', file.name);

      // Create form data
      const formData = new FormData();
      
      // For React Native, we need to create the file object correctly
      const fileToUpload = {
        uri: file.uri,
        type: file.mimeType,
        name: file.name,
      };
      
      console.log('File object being uploaded:', fileToUpload);
      formData.append('file', fileToUpload);

      // Add required consent field
      formData.append('consent', String(true));

      // Add basic metadata (only fields allowed by backend validation)
      const metadata = {
        originalName: file.name,
        size: file.size,
        mimeType: file.mimeType,
        uploadedAt: new Date().toISOString(),
      };
      
      console.log('Metadata being sent:', metadata);
      formData.append('metadata', JSON.stringify(metadata));
      
      // Add extracted text as separate fields if available
      if (extractedText) {
        formData.append('extractedText', extractedText);
        if (textExtractionTimestamp) {
          formData.append('textExtractionTimestamp', textExtractionTimestamp);
        }
        if (textExtractionModel) {
          formData.append('textExtractionModel', textExtractionModel);
        }
      }
      
      console.log('FormData created with extracted text, about to send request...');

      // Upload with progress tracking
      const response = await apiClient.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          
          console.log(`Upload progress: ${percentCompleted}%`);
          
          if (onProgress) {
            onProgress(percentCompleted);
          }
        },
      });

      console.log('Upload completed successfully');

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error) {
      console.error('File upload error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'File upload failed';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Upload file (legacy method, falls back to new method)
  static async uploadFile(file, onProgress = null) {
    return this.uploadFileWithText({ file }, onProgress);
  }

  // Original upload file method (keeping for compatibility)
  static async uploadFileOriginal(file, onProgress = null) {
    try {
      console.log('Starting file upload:', file.name);

      // Create form data
      const formData = new FormData();
      
      // For React Native, we need to create the file object correctly
      const fileToUpload = {
        uri: file.uri,
        type: file.mimeType,
        name: file.name,
      };
      
      console.log('File object being uploaded:', fileToUpload);
      formData.append('file', fileToUpload);

      // Add required consent field - use string explicitly
      formData.append('consent', String(true));
      console.log('Appending consent as string:', String(true));

      // Add metadata
      const metadata = {
        originalName: file.name,
        size: file.size,
        mimeType: file.mimeType,
        uploadedAt: new Date().toISOString(),
      };
      
      console.log('Metadata being sent:', metadata);
      formData.append('metadata', JSON.stringify(metadata));
      
      console.log('FormData created, about to send request...');

      // Upload with progress tracking
      const response = await apiClient.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          
          console.log(`Upload progress: ${percentCompleted}%`);
          
          if (onProgress) {
            onProgress(percentCompleted);
          }
        },
      });

      console.log('Upload completed successfully');

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error) {
      console.error('File upload error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'File upload failed';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Get user files
  static async getFiles(page = 1, limit = 20) {
    try {
      const response = await apiClient.get('/files', {
        params: {
          page,
          limit,
          sortBy: 'createdAt',
          sortOrder: 'desc', // Sort by newest first
        },
      });

      return {
        success: true,
        data: response.data.data,
        pagination: response.data.pagination,
      };
    } catch (error) {
      console.error('Get files error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to fetch files';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Get file details
  static async getFileDetails(fileId) {
    try {
      const response = await apiClient.get(`/files/${fileId}`);

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Get file details error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to fetch file details';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Get processing status
  static async getProcessingStatus(fileId) {
    try {
      const response = await apiClient.get(`/files/${fileId}/status`);

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Get processing status error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to fetch processing status';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Get processing results
  static async getProcessingResults(fileId) {
    try {
      const response = await apiClient.get(`/files/${fileId}/result`);

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Get processing results error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to fetch processing results';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Delete file
  static async deleteFile(fileId) {
    try {
      const response = await apiClient.delete(`/files/${fileId}`);

      return {
        success: true,
        message: response.data.message,
      };
    } catch (error) {
      console.error('Delete file error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to delete file';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Share file
  static async shareFile(fileId, shareWith, permissions = 'read') {
    try {
      const response = await apiClient.post(`/files/${fileId}/share`, {
        shareWith,
        permissions,
        expiresAt: null, // No expiration by default
      });

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Share file error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to share file';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Download file (get download URL)
  static async getDownloadUrl(fileId) {
    try {
      const response = await apiClient.get(`/files/${fileId}/download`);

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Get download URL error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to get download URL';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Get file format info
  static getFileFormatInfo(mimeType) {
    const formats = {
      'application/pdf': {
        name: 'PDF',
        icon: 'picture-as-pdf',
        color: '#4B0082',
      },
      'image/jpeg': {
        name: 'JPEG',
        icon: 'image',
        color: '#00CC66',
      },
      'image/jpg': {
        name: 'JPG',
        icon: 'image',
        color: '#00CC66',
      },
      'image/png': {
        name: 'PNG',
        icon: 'image',
        color: '#E6E6FA',
      },
      'image/tiff': {
        name: 'TIFF',
        icon: 'image',
        color: '#4B0082',
      },
      'image/bmp': {
        name: 'BMP',
        icon: 'image',
        color: '#1A1A1A',
      },
    };

    return formats[mimeType] || {
      name: 'Unknown',
      icon: 'insert-drive-file',
      color: '#1A1A1A',
    };
  }

  // Format file size
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default FileService;