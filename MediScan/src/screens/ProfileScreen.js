import React, { useState, useEffect } from 'react';
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
  TextInput,
  Avatar,
  Divider,
  List,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/MaterialIcons';
import LanguageSelector from '../components/LanguageSelector';

const ProfileScreen = ({ navigation }) => {
  const { user, logout, updateProfile } = useAuth();
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const result = await updateProfile(formData);
      if (result.success) {
        setIsEditing(false);
        Alert.alert('Success', 'Profile updated successfully');
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
    });
    setIsEditing(false);
  };

  const handleLogout = () => {
    Alert.alert(
      t('common.logout'),
      t('profile.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    );
  };

  const handleLanguagePress = () => {
    setShowLanguageSelector(true);
  };

  const handleLanguageChange = (languageCode) => {
    // Language change is handled in the LanguageSelector component
    console.log('Language changed to:', languageCode);
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
          <Card style={styles.profileCard}>
            <Card.Content>
              <View style={styles.avatarContainer}>
                <Avatar.Text
                  size={80}
                  label={user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  style={styles.avatar}
                />
                <Title style={styles.userName}>
                  {user?.name || 'User'}
                </Title>
                <Paragraph style={styles.userRole}>
                  {user?.role || 'Patient'}
                </Paragraph>
              </View>

              <Divider style={styles.divider} />

              {isEditing ? (
                <View style={styles.editForm}>
                  <TextInput
                    label={t('auth.fullName')}
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    style={styles.input}
                  />
                  <TextInput
                    label={t('auth.email')}
                    value={formData.email}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                    style={styles.input}
                    keyboardType="email-address"
                  />
                  
                  <View style={styles.editButtons}>
                    <Button
                      mode="outlined"
                      onPress={handleCancel}
                      style={styles.cancelButton}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleSave}
                      style={styles.saveButton}
                    >
                      {t('common.save')}
                    </Button>
                  </View>
                </View>
              ) : (
                <View>
                  <List.Section>
                    <List.Subheader>{t('profile.personalInfo')}</List.Subheader>
                    <List.Item
                      title={t('auth.fullName')}
                      description={user?.name || t('profile.personalInfo')}
                      left={props => <List.Icon {...props} icon="account" />}
                    />
                    <List.Item
                      title={t('auth.email')}
                      description={user?.email || 'Not set'}
                      left={props => <List.Icon {...props} icon="email" />}
                    />
                    
                    <List.Subheader>{t('profile.preferences')}</List.Subheader>
                    <List.Item
                      title={t('profile.language')}
                      description={t('profile.changeLanguage')}
                      left={props => <List.Icon {...props} icon="translate" />}
                      right={props => <List.Icon {...props} icon="chevron-right" />}
                      onPress={handleLanguagePress}
                    />
                    
                    <List.Subheader>{t('profile.about')}</List.Subheader>
                    <List.Item
                      title="Member Since"
                      description={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                      left={props => <List.Icon {...props} icon="calendar" />}
                    />
                  </List.Section>
                </View>
              )}
            </Card.Content>
          </Card>

          <View style={styles.buttonContainer}>
            {!isEditing && (
              <Button
                mode="contained"
                onPress={handleEdit}
                style={[styles.button, styles.editButton]}
                contentStyle={styles.buttonContent}
                icon="pencil"
              >
                {t('common.edit')}
              </Button>
            )}

            <Button
              mode="outlined"
              onPress={handleLogout}
              style={[styles.button, styles.logoutButton]}
              contentStyle={styles.buttonContent}
              icon="logout"
            >
              {t('common.logout')}
            </Button>
          </View>
        </Animatable.View>
      </ScrollView>
      
      <LanguageSelector
        visible={showLanguageSelector}
        onClose={() => setShowLanguageSelector(false)}
        onLanguageChange={handleLanguageChange}
      />
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
  },
  profileCard: {
    borderRadius: 15,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 20,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    backgroundColor: '#4B0082',
    marginBottom: 10,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4B0082',
    marginBottom: 5,
  },
  userRole: {
    fontSize: 16,
    color: '#666',
    textTransform: 'capitalize',
  },
  divider: {
    marginVertical: 20,
    height: 2,
    backgroundColor: '#E0E0E0',
  },
  editForm: {
    gap: 15,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    borderColor: '#666',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#4B0082',
  },
  buttonContainer: {
    gap: 15,
  },
  button: {
    borderRadius: 25,
    elevation: 3,
  },
  editButton: {
    backgroundColor: '#4B0082',
  },
  logoutButton: {
    borderColor: '#FF6B6B',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  buttonContent: {
    paddingVertical: 8,
  },
});

export default ProfileScreen;