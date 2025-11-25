import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import {
  ActivityIndicator,
  Title,
  Paragraph,
  Card,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import Icon from 'react-native-vector-icons/MaterialIcons';

const LoadingScreen = ({ route, navigation }) => {
  const { 
    title = 'Processing...', 
    message = 'Please wait while we process your request',
    duration = parseInt(process.env.EXPO_PUBLIC_DEFAULT_LOADING_DURATION) || 5000,
    onComplete
  } = route.params || {};

  const spinValue = new Animated.Value(0);

  useEffect(() => {
    // Start spinning animation
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    spinAnimation.start();

    // Auto-navigate after duration if onComplete is provided
    const timer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      } else {
        // Default behavior - go back
        navigation.goBack();
      }
    }, duration);

    return () => {
      spinAnimation.stop();
      clearTimeout(timer);
    };
  }, [duration, navigation, onComplete, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <LinearGradient
      colors={['#4B0082', '#00CC66']}
      style={styles.container}
    >
      <View style={styles.content}>
        <Animatable.View
          animation="fadeInUp"
          duration={1000}
          style={styles.cardContainer}
        >
          <Card style={styles.loadingCard}>
            <Card.Content>
              <View style={styles.iconContainer}>
                <Animated.View style={[styles.iconWrapper, { transform: [{ rotate: spin }] }]}>
                  <Icon name="refresh" size={60} color="#4B0082" />
                </Animated.View>
              </View>

              <Title style={styles.title}>{title}</Title>
              <Paragraph style={styles.message}>{message}</Paragraph>

              <View style={styles.progressContainer}>
                <ActivityIndicator 
                  animating={true} 
                  color="#4B0082" 
                  size="large" 
                  style={styles.activityIndicator}
                />
              </View>

              <View style={styles.dotsContainer}>
                <Animatable.View
                  animation="pulse"
                  iterationCount="infinite"
                  duration={1000}
                  delay={0}
                >
                  <View style={[styles.dot, styles.dot1]} />
                </Animatable.View>
                <Animatable.View
                  animation="pulse"
                  iterationCount="infinite"
                  duration={1000}
                  delay={200}
                >
                  <View style={[styles.dot, styles.dot2]} />
                </Animatable.View>
                <Animatable.View
                  animation="pulse"
                  iterationCount="infinite"
                  duration={1000}
                  delay={400}
                >
                  <View style={[styles.dot, styles.dot3]} />
                </Animatable.View>
              </View>
            </Card.Content>
          </Card>
        </Animatable.View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 350,
  },
  loadingCard: {
    borderRadius: 20,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconWrapper: {
    padding: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4B0082',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  activityIndicator: {
    transform: [{ scale: 1.5 }],
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dot1: {
    backgroundColor: '#4B0082',
  },
  dot2: {
    backgroundColor: '#00CC66',
  },
  dot3: {
    backgroundColor: '#4B0082',
  },
});

export default LoadingScreen;