import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Divider,
  Chip,
  List,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import Icon from 'react-native-vector-icons/MaterialIcons';

const ResultsScreen = ({ route, navigation }) => {
  const { fileId, analysisResults } = route.params || {};

  const handleViewDetails = () => {
    navigation.navigate('FileDetails', { fileId });
  };

  const handleDownloadReport = () => {
    Alert.alert(
      'Download Report',
      'Report download functionality will be implemented soon.',
      [{ text: 'OK' }]
    );
  };

  const handleShareResults = () => {
    Alert.alert(
      'Share Results',
      'Share functionality will be implemented soon.',
      [{ text: 'OK' }]
    );
  };

  return (
    <LinearGradient
      colors={['#4B0082', '#00CC66']}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <Animatable.View
          animation="fadeInUp"
          duration={1000}
        >
          <Card style={styles.resultCard}>
            <Card.Content>
              <View style={styles.header}>
                <Icon name="assessment" size={32} color="#4B0082" />
                <Title style={styles.title}>Analysis Results</Title>
              </View>

              <Divider style={styles.divider} />

              {analysisResults ? (
                <View>
                  <Paragraph style={styles.subtitle}>
                    Analysis completed successfully
                  </Paragraph>
                  
                  <View style={styles.statusContainer}>
                    <Chip 
                      icon="check-circle" 
                      style={styles.statusChip}
                      textStyle={styles.chipText}
                    >
                      Complete
                    </Chip>
                  </View>

                  <List.Section>
                    <List.Subheader>Key Findings</List.Subheader>
                    <List.Item
                      title="Document Type"
                      description={analysisResults.documentType || "Medical Report"}
                      left={props => <List.Icon {...props} icon="file-document" />}
                    />
                    <List.Item
                      title="Confidence Level"
                      description={`${analysisResults.confidence || 95}%`}
                      left={props => <List.Icon {...props} icon="chart-line" />}
                    />
                    <List.Item
                      title="Processing Time"
                      description={`${analysisResults.processingTime || 2.5}s`}
                      left={props => <List.Icon {...props} icon="clock" />}
                    />
                  </List.Section>
                </View>
              ) : (
                <View style={styles.placeholderContainer}>
                  <Icon name="info" size={48} color="#666" />
                  <Paragraph style={styles.placeholderText}>
                    No analysis results available
                  </Paragraph>
                </View>
              )}
            </Card.Content>
          </Card>

          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={handleViewDetails}
              style={[styles.button, styles.primaryButton]}
              contentStyle={styles.buttonContent}
              icon="eye"
            >
              View Details
            </Button>

            <Button
              mode="outlined"
              onPress={handleDownloadReport}
              style={[styles.button, styles.secondaryButton]}
              contentStyle={styles.buttonContent}
              icon="download"
            >
              Download Report
            </Button>

            <Button
              mode="outlined"
              onPress={handleShareResults}
              style={[styles.button, styles.secondaryButton]}
              contentStyle={styles.buttonContent}
              icon="share"
            >
              Share Results
            </Button>
          </View>
        </Animatable.View>
      </ScrollView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  resultCard: {
    borderRadius: 15,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    marginLeft: 10,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4B0082',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  divider: {
    marginVertical: 15,
    height: 2,
    backgroundColor: '#E0E0E0',
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusChip: {
    backgroundColor: '#00CC66',
  },
  chipText: {
    color: 'white',
    fontWeight: 'bold',
  },
  placeholderContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
    marginTop: 15,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 15,
  },
  button: {
    borderRadius: 25,
    elevation: 3,
  },
  primaryButton: {
    backgroundColor: '#4B0082',
  },
  secondaryButton: {
    borderColor: '#4B0082',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  buttonContent: {
    paddingVertical: 8,
  },
});

export default ResultsScreen;