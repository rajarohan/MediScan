import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  FAB,
  Chip,
  List,
  Avatar,
  Divider,
  ActivityIndicator,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAuth } from '../context/AuthContext';
import FileService from '../services/FileService';
import Toast from 'react-native-toast-message';

const HomeScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  
  const [recentFiles, setRecentFiles] = useState([]);
  const [stats, setStats] = useState({
    totalFiles: 0,
    processingFiles: 0,
    completedFiles: 0,
    storageUsed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load recent files
      const filesResponse = await FileService.getFiles(1, 5);
      if (filesResponse.success) {
        setRecentFiles(filesResponse.data.files || []);
        
        // Calculate stats
        const files = filesResponse.data.files || [];
        const totalFiles = files.length;
        const processingFiles = files.filter(f => f.processingStatus === 'processing').length;
        const completedFiles = files.filter(f => f.processingStatus === 'completed').length;
        const storageUsed = files.reduce((total, file) => total + (file.size || 0), 0);
        
        setStats({
          totalFiles,
          processingFiles,
          completedFiles,
          storageUsed,
        });
      }
    } catch (error) {
      console.error('Dashboard load error:', error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to load dashboard data',
      });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleQuickUpload = () => {
    navigation.navigate('Upload');
  };

  const handleViewAllFiles = () => {
    navigation.navigate('Files');
  };

  const handleFilePress = (file) => {
    navigation.navigate('FileDetails', { fileId: file._id });
  };

  const formatFileSize = (bytes) => {
    return FileService.formatFileSize(bytes);
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4B0082" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Welcome Header */}
        <LinearGradient
          colors={['#00CC66', '#4B0082']}
          style={styles.headerGradient}
        >
          <Animatable.View animation="fadeInDown" duration={800}>
            <Text style={styles.welcomeText}>
              Welcome back, {user?.name || 'User'}!
            </Text>
            <Text style={styles.subtitleText}>
              Here's your medical document overview
            </Text>
          </Animatable.View>
        </LinearGradient>

        {/* Stats Cards */}
        <Animatable.View animation="fadeInUp" duration={800} delay={200}>
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <Card style={[styles.statCard, { backgroundColor: '#E6E6FA' }]}>
                <Card.Content style={styles.statContent}>
                  <Icon name="folder" size={24} color="#4B0082" />
                  <Text style={styles.statNumber}>{stats.totalFiles}</Text>
                  <Text style={styles.statLabel}>Total Files</Text>
                </Card.Content>
              </Card>
              
              <Card style={[styles.statCard, { backgroundColor: '#FAFAFA' }]}>
                <Card.Content style={styles.statContent}>
                  <Icon name="refresh" size={24} color="#4B0082" />
                  <Text style={styles.statNumber}>{stats.processingFiles}</Text>
                  <Text style={styles.statLabel}>Processing</Text>
                </Card.Content>
              </Card>
            </View>
            
            <View style={styles.statsRow}>
              <Card style={[styles.statCard, { backgroundColor: '#E6E6FA' }]}>
                <Card.Content style={styles.statContent}>
                  <Icon name="check-circle" size={24} color="#00CC66" />
                  <Text style={styles.statNumber}>{stats.completedFiles}</Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </Card.Content>
              </Card>
              
              <Card style={[styles.statCard, { backgroundColor: '#E6E6FA' }]}>
                <Card.Content style={styles.statContent}>
                  <Icon name="storage" size={24} color="#4B0082" />
                  <Text style={styles.statNumber}>{formatFileSize(stats.storageUsed)}</Text>
                  <Text style={styles.statLabel}>Storage Used</Text>
                </Card.Content>
              </Card>
            </View>
          </View>
        </Animatable.View>

        {/* Quick Actions */}
        <Animatable.View animation="fadeInUp" duration={800} delay={400}>
          <Card style={styles.actionsCard}>
            <Card.Content>
              <Title style={styles.cardTitle}>Quick Actions</Title>
              
              <View style={styles.actionsContainer}>
                <Button
                  mode="contained"
                  onPress={handleQuickUpload}
                  style={[styles.actionButton, { backgroundColor: '#00CC66' }]}
                  contentStyle={styles.actionButtonContent}
                  icon="cloud-upload"
                >
                  Upload Document
                </Button>
                
                <Button
                  mode="outlined"
                  onPress={handleViewAllFiles}
                  style={styles.actionButton}
                  contentStyle={styles.actionButtonContent}
                  icon="folder-open"
                >
                  View All Files
                </Button>
              </View>
            </Card.Content>
          </Card>
        </Animatable.View>

        {/* Recent Files */}
        <Animatable.View animation="fadeInUp" duration={800} delay={600}>
          <Card style={styles.recentFilesCard}>
            <Card.Content>
              <View style={styles.recentFilesHeader}>
                <Title style={styles.cardTitle}>Recent Files</Title>
                {recentFiles.length > 0 && (
                  <Button
                    mode="text"
                    onPress={handleViewAllFiles}
                    compact
                  >
                    View All
                  </Button>
                )}
              </View>
              
              {recentFiles.length > 0 ? (
                <View>
                  {recentFiles.map((file, index) => (
                    <View key={file._id}>
                      <List.Item
                        title={file.originalName}
                        description={`Uploaded ${new Date(file.createdAt).toLocaleDateString()}`}
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
                      {index < recentFiles.length - 1 && <Divider />}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Icon name="folder-open" size={48} color="#E6E6FA" />
                  <Text style={styles.emptyStateText}>No files uploaded yet</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Upload your first medical document to get started
                  </Text>
                  <Button
                    mode="contained"
                    onPress={handleQuickUpload}
                    style={styles.emptyStateButton}
                    icon="cloud-upload"
                  >
                    Upload Document
                  </Button>
                </View>
              )}
            </Card.Content>
          </Card>
        </Animatable.View>
      </ScrollView>

      {/* Floating Action Button */}
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={handleQuickUpload}
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
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  headerGradient: {
    padding: 20,
    paddingTop: 40,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  statsContainer: {
    padding: 16,
    marginTop: -20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    marginHorizontal: 6,
    elevation: 2,
  },
  statContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#1A1A1A',
    marginTop: 4,
  },
  actionsCard: {
    margin: 16,
    elevation: 2,
  },
  cardTitle: {
    color: '#4B0082',
    marginBottom: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 6,
  },
  actionButtonContent: {
    paddingVertical: 8,
  },
  recentFilesCard: {
    margin: 16,
    elevation: 2,
  },
  recentFilesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fileItem: {
    paddingVertical: 8,
  },
  fileStatusContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#1A1A1A',
    marginTop: 16,
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#1A1A1A',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyStateButton: {
    marginTop: 20,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#00CC66',
  },
});

export default HomeScreen;