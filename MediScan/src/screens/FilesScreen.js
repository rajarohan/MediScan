// FilesScreen.js - List of user files
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Card,
  Title,
  List,
  Avatar,
  Chip,
  Searchbar,
  FAB,
  ActivityIndicator,
  Text,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import FileService from '../services/FileService';
import Toast from 'react-native-toast-message';

const FilesScreen = ({ navigation }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFiles, setFilteredFiles] = useState([]);

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    // Filter files based on search query
    if (searchQuery.trim()) {
      const filtered = files.filter(file =>
        file.originalName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFiles(filtered);
    } else {
      setFilteredFiles(files);
    }
  }, [files, searchQuery]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await FileService.getFiles();
      
      if (response.success) {
        setFiles(response.data.files || []);
      } else {
        Toast.show({
          type: 'error',
          text1: 'Error',
          text2: response.message || 'Failed to load files',
        });
      }
    } catch (error) {
      console.error('Load files error:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load files',
      });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFiles();
    setRefreshing(false);
  };

  const handleFilePress = (file) => {
    navigation.navigate('FileDetails', { fileId: file._id });
  };

  const getProcessingStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#00CC66';
      case 'processing':
        return '#4B0082';
      case 'failed':
        return '#1A1A1A';
      default:
        return '#1A1A1A';
    }
  };

  const getProcessingStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return 'check-circle';
      case 'processing':
        return 'refresh';
      case 'failed':
        return 'error';
      default:
        return 'help';
    }
  };

  const renderFileItem = ({ item: file }) => (
    <Card style={styles.fileCard} onPress={() => handleFilePress(file)}>
      <List.Item
        title={file.originalName}
        description={`Uploaded ${new Date(file.createdAt).toLocaleDateString()} • ${FileService.formatFileSize(file.size)}`}
        left={(props) => (
          <Avatar.Icon
            {...props}
            icon={FileService.getFileFormatInfo(file.mimeType).icon}
            style={{
              backgroundColor: FileService.getFileFormatInfo(file.mimeType).color,
            }}
          />
        )}
        right={(props) => (
          <View style={styles.fileStatusContainer}>
            <Chip
              icon={getProcessingStatusIcon(file.processingStatus)}
              style={{
                backgroundColor: getProcessingStatusColor(file.processingStatus),
              }}
              textStyle={{ color: 'white', fontSize: 12 }}
              compact
            >
              {file.processingStatus}
            </Chip>
          </View>
        )}
        onPress={() => handleFilePress(file)}
        style={styles.fileItem}
      />
    </Card>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="folder-open" size={64} color="#E6E6FA" />
      <Text style={styles.emptyStateText}>No files found</Text>
      <Text style={styles.emptyStateSubtext}>
        {searchQuery ? 'Try adjusting your search' : 'Upload your first document to get started'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4B0082" />
        <Text style={styles.loadingText}>Loading files...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search files..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
        iconColor="#4B0082"
      />

      <FlatList
        data={filteredFiles}
        renderItem={renderFileItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={EmptyState}
        showsVerticalScrollIndicator={false}
      />

      <FAB
        style={styles.fab}
        icon="add"
        onPress={() => navigation.navigate('Upload')}
        label="Upload"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1A1A1A',
  },
  searchBar: {
    margin: 16,
    elevation: 2,
  },
  listContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  fileCard: {
    marginBottom: 8,
    elevation: 1,
  },
  fileItem: {
    paddingVertical: 8,
  },
  fileStatusContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 20,
    color: '#1A1A1A',
    marginTop: 16,
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 16,
    color: '#1A1A1A',
    marginTop: 8,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#00CC66',
  },
});

export default FilesScreen;