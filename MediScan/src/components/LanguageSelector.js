import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LanguageSelector = ({ visible, onClose, onLanguageChange }) => {
  const { t, i18n } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);

  const languages = [
    { code: 'en', name: t('languages.en'), nativeName: 'English' },
    { code: 'hi', name: t('languages.hi'), nativeName: 'हिन्दी' },
    { code: 'te', name: t('languages.te'), nativeName: 'తెలుగు' },
    { code: 'ta', name: t('languages.ta'), nativeName: 'தமிழ்' },
    { code: 'kn', name: t('languages.kn'), nativeName: 'ಕನ್ನಡ' },
    { code: 'ml', name: t('languages.ml'), nativeName: 'മലയാളം' },
    { code: 'gu', name: t('languages.gu'), nativeName: 'ગુજરાતી' },
    { code: 'mr', name: t('languages.mr'), nativeName: 'मराठी' },
    { code: 'bn', name: t('languages.bn'), nativeName: 'বাংলা' },
  ];

  const handleLanguageSelect = async (languageCode) => {
    try {
      setSelectedLanguage(languageCode);
      await i18n.changeLanguage(languageCode);
      await AsyncStorage.setItem('selectedLanguage', languageCode);
      
      if (onLanguageChange) {
        onLanguageChange(languageCode);
      }
      
      Alert.alert(
        t('common.success'),
        t('profile.changeLanguage') + ' ' + languages.find(l => l.code === languageCode)?.nativeName,
        [{ text: t('common.ok'), onPress: onClose }]
      );
    } catch (error) {
      console.error('Error changing language:', error);
      Alert.alert(
        t('common.error'),
        t('errors.unknownError'),
        [{ text: t('common.ok') }]
      );
    }
  };

  const renderLanguageItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.languageItem,
        selectedLanguage === item.code && styles.selectedLanguageItem,
      ]}
      onPress={() => handleLanguageSelect(item.code)}
    >
      <View style={styles.languageInfo}>
        <Text style={[
          styles.languageName,
          selectedLanguage === item.code && styles.selectedLanguageName,
        ]}>
          {item.nativeName}
        </Text>
        <Text style={[
          styles.languageCode,
          selectedLanguage === item.code && styles.selectedLanguageCode,
        ]}>
          {item.name}
        </Text>
      </View>
      {selectedLanguage === item.code && (
        <Icon name="check" size={24} color="#4CAF50" />
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile.selectLanguage')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>
        
        <FlatList
          data={languages}
          renderItem={renderLanguageItem}
          keyExtractor={(item) => item.code}
          style={styles.languageList}
          showsVerticalScrollIndicator={false}
        />
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('profile.changeLanguage')}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  languageList: {
    flex: 1,
    padding: 10,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginVertical: 5,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  selectedLanguageItem: {
    backgroundColor: '#e8f5e8',
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  selectedLanguageName: {
    color: '#2E7D32',
  },
  languageCode: {
    fontSize: 14,
    color: '#666',
  },
  selectedLanguageCode: {
    color: '#4CAF50',
  },
  footer: {
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default LanguageSelector;