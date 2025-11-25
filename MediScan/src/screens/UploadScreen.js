import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import {
  Card,
  Title,
  Button,
  ProgressBar,
  Chip,
  Divider,
} from 'react-native-paper';
import * as Animatable from 'react-native-animatable';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FileService from '../services/FileService';
import TextExtractionService from '../services/TextExtractionService';
import Toast from 'react-native-toast-message';

const UploadScreen = ({ navigation }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractingText, setExtractingText] = useState(false);
  const [extractedText, setExtractedText] = useState(null);
  const [textExtractionError, setTextExtractionError] = useState(null);

  const handlePickDocument = async () => {
    try {
      const result = await FileService.pickDocument();
      
      if (result.success) {
        setSelectedFile(result.file);
        Toast.show({
          type: 'success',
          text1: 'File Selected',
          text2: `${result.file.name} is ready to upload`,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Selection Failed',
          text2: result.message,
        });
      }
    } catch (error) {
      console.error('Pick document error:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to pick document',
      });
    }
  };

  const handlePickImage = async (fromCamera = false) => {
    try {
      const result = await FileService.pickImage(fromCamera);
      
      if (result.success) {
        setSelectedFile(result.file);
        
        // Start text extraction for images
        if (result.file.mimeType.startsWith('image/')) {
          handleTextExtraction(result.file);
        }
        
        Toast.show({
          type: 'success',
          text1: 'Image Selected',
          text2: `Image is ready for processing`,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Selection Failed',
          text2: result.message,
        });
      }
    } catch (error) {
      console.error('Pick image error:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to pick image',
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      Toast.show({
        type: 'error',
        text1: 'No File Selected',
        text2: 'Please select a file to upload',
      });
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      // Prepare upload data with extracted text
      const uploadData = {
        file: selectedFile,
        extractedText: extractedText,
        textExtractionTimestamp: extractedText ? new Date().toISOString() : null,
        textExtractionModel: extractedText ? (process.env.EXPO_PUBLIC_TEXT_EXTRACTION_MODEL || 'google/gemma-2-27b-it') : null,
      };

      const result = await FileService.uploadFileWithText(uploadData, (progress) => {
        setUploadProgress(progress);
      });

      if (result.success) {
        Toast.show({
          type: 'success',
          text1: 'Upload Successful',
          text2: extractedText ? 'Document uploaded with extracted text' : 'Your document is being processed',
        });

        // Navigate to loading screen or results
        navigation.navigate('Loading', {
          fileId: result.data.fileId,
          fileName: selectedFile.name,
          hasExtractedText: !!extractedText,
        });

        // Reset form
        setSelectedFile(null);
        setUploadProgress(0);
        setExtractedText(null);
        setTextExtractionError(null);
      } else {
        Toast.show({
          type: 'error',
          text1: 'Upload Failed',
          text2: result.message,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      Toast.show({
        type: 'error',
        text1: 'Upload Error',
        text2: 'Something went wrong during upload',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleTextExtraction = async (file) => {
    if (!file.mimeType.startsWith('image/')) {
      return; // Skip text extraction for non-images
    }

    try {
      setExtractingText(true);
      setTextExtractionError(null);
      setExtractedText(null);

      Toast.show({
        type: 'info',
        text1: 'Analyzing Image',
        text2: 'Extracting text from medical document...',
      });

      const result = await TextExtractionService.extractTextFromImage(file.uri);
      
      if (result.success) {
        setExtractedText(result.extractedText);
        Toast.show({
          type: 'success',
          text1: 'Text Extracted',
          text2: 'Medical document analysis completed',
        });
      } else {
        setTextExtractionError(result.message);
        Toast.show({
          type: 'warning',
          text1: 'Text Extraction Failed',
          text2: result.message + ' (Upload will continue without text extraction)',
        });
      }
    } catch (error) {
      console.error('Text extraction error:', error);
      setTextExtractionError('Failed to extract text from image');
      Toast.show({
        type: 'warning',
        text1: 'Text Extraction Error',
        text2: 'Upload will continue without text extraction',
      });
    } finally {
      setExtractingText(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setExtractedText(null);
    setTextExtractionError(null);
  };

  const getFileIcon = (mimeType) => {
    if (mimeType?.startsWith('image/')) {
      return 'image';
    } else if (mimeType === 'application/pdf') {
      return 'picture-as-pdf';
    }
    return 'insert-drive-file';
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      <Animatable.View animation="fadeInUp" duration={800}>
        <Card style={styles.instructionCard}>
          <Card.Content>
            <View style={styles.instructionHeader}>
              <Icon name="info" size={24} color="#4B0082" />
              <Title style={styles.instructionTitle}>Upload Instructions</Title>
            </View>
            <Text style={styles.instructionText}>
              • Supported formats: PDF, JPEG, PNG, TIFF, BMP{'\n'}
              • Maximum file size: 16MB{'\n'}
              • Ensure document is clear and readable{'\n'}
              • Processing typically takes 1-3 minutes
            </Text>
          </Card.Content>
        </Card>
      </Animatable.View>

      {!selectedFile ? (
        <Animatable.View animation="fadeInUp" duration={800} delay={200}>
          <Card style={styles.uploadOptionsCard}>
            <Card.Content>
              <Title style={styles.cardTitle}>Select Document Source</Title>
              
              <Button
                mode="contained"
                onPress={handlePickDocument}
                style={styles.optionButton}
                contentStyle={styles.buttonContent}
                icon="folder-open"
              >
                Choose from Files
              </Button>

              <Button
                mode="contained"
                onPress={() => handlePickImage(true)}
                style={styles.optionButton}
                contentStyle={styles.buttonContent}
                icon="camera"
              >
                Take Photo
              </Button>

              <Button
                mode="contained"
                onPress={() => handlePickImage(false)}
                style={styles.optionButton}
                contentStyle={styles.buttonContent}
                icon="image"
              >
                Choose from Gallery
              </Button>
            </Card.Content>
          </Card>
        </Animatable.View>
      ) : (
        <Animatable.View animation="fadeInUp" duration={800} delay={200}>
          <Card style={styles.selectedFileCard}>
            <Card.Content>
              <Title style={styles.cardTitle}>Selected File</Title>
              
              <View style={styles.fileInfo}>
                <Icon 
                  name={getFileIcon(selectedFile.mimeType)} 
                  size={48} 
                  color="#4B0082" 
                />
                <View style={styles.fileDetails}>
                  <Text style={styles.fileName}>{selectedFile.name}</Text>
                  <Text style={styles.fileSize}>
                    {FileService.formatFileSize(selectedFile.size)}
                  </Text>
                  <Chip
                    icon="check"
                    style={styles.fileTypeChip}
                    textStyle={styles.chipText}
                  >
                    {FileService.getFileFormatInfo(selectedFile.mimeType).name}
                  </Chip>
                </View>
              </View>

              <Divider style={styles.divider} />

              {/* Text Extraction Status */}
              {selectedFile?.mimeType?.startsWith('image/') && (
                <View style={styles.textExtractionContainer}>
                  {extractingText && (
                    <View style={styles.extractionProgress}>
                      <Icon name="text-fields" size={20} color="#4B0082" />
                      <Text style={styles.extractionText}>Extracting text from image...</Text>
                      <ProgressBar
                        indeterminate
                        style={styles.extractionProgressBar}
                        color="#4B0082"
                      />
                    </View>
                  )}

                  {extractedText && (
                    <View style={styles.extractionSuccess}>
                      <View style={styles.extractionHeader}>
                        <Icon name="check-circle" size={20} color="#00CC66" />
                        <Text style={styles.extractionSuccessText}>Text Extracted Successfully</Text>
                      </View>
                      <Text style={styles.extractedTextPreview} numberOfLines={3}>
                        {extractedText.substring(0, 150)}...
                      </Text>
                      <Button
                        mode="text"
                        onPress={() => Alert.alert('Extracted Text', extractedText)}
                        style={styles.viewTextButton}
                        compact
                      >
                        View Full Text
                      </Button>
                    </View>
                  )}

                  {textExtractionError && (
                    <View style={styles.extractionError}>
                      <Icon name="warning" size={20} color="#FF6B35" />
                      <Text style={styles.extractionErrorText}>
                        Text extraction failed: {textExtractionError}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {uploading && (
                <View style={styles.progressContainer}>
                  <Text style={styles.progressText}>
                    Uploading... {uploadProgress}%
                  </Text>
                  <ProgressBar
                    progress={uploadProgress / 100}
                    style={styles.progressBar}
                    color="#00CC66"
                  />
                </View>
              )}

              <View style={styles.actionButtons}>
                <Button
                  mode="outlined"
                  onPress={handleClearSelection}
                  disabled={uploading}
                  style={styles.actionButton}
                  icon="close"
                >
                  Clear
                </Button>
                
                <Button
                  mode="contained"
                  onPress={handleUpload}
                  loading={uploading}
                  disabled={uploading}
                  style={[styles.actionButton, styles.uploadButton]}
                  icon="cloud-upload"
                >
                  {uploading ? 'Uploading...' : 'Upload & Process'}
                </Button>
              </View>
            </Card.Content>
          </Card>
        </Animatable.View>
      )}

      <Animatable.View animation="fadeInUp" duration={800} delay={400}>
        <Card style={styles.securityCard}>
          <Card.Content>
            <View style={styles.securityHeader}>
              <Icon name="security" size={24} color="#00CC66" />
              <Title style={styles.securityTitle}>Security & Privacy</Title>
            </View>
            <Text style={styles.securityText}>
              Your medical documents are encrypted and processed securely. We comply with HIPAA regulations and never share your data with third parties.
            </Text>
          </Card.Content>
        </Card>
      </Animatable.View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollContainer: {
    padding: 16,
  },
  instructionCard: {
    marginBottom: 16,
    elevation: 2,
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionTitle: {
    marginLeft: 8,
    color: '#4B0082',
    fontSize: 18,
  },
  instructionText: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
  },
  uploadOptionsCard: {
    marginBottom: 16,
    elevation: 2,
  },
  cardTitle: {
    color: '#4B0082',
    marginBottom: 16,
    textAlign: 'center',
  },
  optionButton: {
    marginBottom: 12,
    backgroundColor: '#00CC66',
  },
  buttonContent: {
    paddingVertical: 8,
  },
  selectedFileCard: {
    marginBottom: 16,
    elevation: 2,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  fileDetails: {
    flex: 1,
    marginLeft: 16,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 14,
    color: '#1A1A1A',
    marginBottom: 8,
  },
  fileTypeChip: {
    backgroundColor: '#E6E6FA',
    alignSelf: 'flex-start',
  },
  chipText: {
    color: '#4B0082',
    fontSize: 12,
  },
  divider: {
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    textAlign: 'center',
    marginBottom: 8,
    color: '#1A1A1A',
    fontSize: 14,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 6,
  },
  uploadButton: {
    backgroundColor: '#00CC66',
  },
  securityCard: {
    elevation: 2,
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  securityTitle: {
    marginLeft: 8,
    color: '#00CC66',
    fontSize: 18,
  },
  securityText: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
  },
  textExtractionContainer: {
    marginBottom: 16,
  },
  extractionProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F0F0FF',
    borderRadius: 8,
    marginBottom: 8,
  },
  extractionText: {
    marginLeft: 8,
    flex: 1,
    color: '#4B0082',
    fontSize: 14,
  },
  extractionProgressBar: {
    width: 60,
    height: 4,
    marginLeft: 8,
  },
  extractionSuccess: {
    padding: 12,
    backgroundColor: '#F0FFF0',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#00CC66',
    marginBottom: 8,
  },
  extractionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  extractionSuccessText: {
    marginLeft: 8,
    color: '#00CC66',
    fontSize: 14,
    fontWeight: '500',
  },
  extractedTextPreview: {
    fontSize: 12,
    color: '#1A1A1A',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  viewTextButton: {
    alignSelf: 'flex-start',
  },
  extractionError: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFF0F0',
    borderRadius: 8,
    marginBottom: 8,
  },
  extractionErrorText: {
    marginLeft: 8,
    color: '#FF6B35',
    fontSize: 12,
    flex: 1,
  },
});

export default UploadScreen;