// Placeholder screens for the remaining components

// FileDetailsScreen.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, Button } from 'react-native-paper';

const FileDetailsScreen = ({ route, navigation }) => {
  const { fileId } = route.params;

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>File Details</Text>
          <Text>File ID: {fileId}</Text>
          <Button 
            mode="contained" 
            onPress={() => navigation.navigate('Results', { fileId })}
            style={styles.button}
          >
            View Results
          </Button>
        </Card.Content>
      </Card>
    </View>
  );
};

// ResultsScreen.js
export const ResultsScreen = ({ route }) => {
  const { fileId } = route.params;

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>Analysis Results</Text>
          <Text>Processing results for file: {fileId}</Text>
          <Text style={styles.subtitle}>OCR Text, Medical Entities, and Summary would be displayed here</Text>
        </Card.Content>
      </Card>
    </View>
  );
};

// ProfileScreen.js
export const ProfileScreen = () => {
  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>User Profile</Text>
          <Text>Profile management interface</Text>
        </Card.Content>
      </Card>
    </View>
  );
};

// LoadingScreen.js
export const LoadingScreen = ({ route }) => {
  const { fileName } = route.params || {};

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.title}>Processing Document</Text>
          <Text>Processing: {fileName}</Text>
          <Text style={styles.subtitle}>Please wait while we analyze your document...</Text>
        </Card.Content>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4B0082',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#1A1A1A',
    marginTop: 16,
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#00CC66',
  },
});

export default FileDetailsScreen;