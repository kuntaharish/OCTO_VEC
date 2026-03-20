/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee from '@notifee/react-native';

AppRegistry.registerComponent(appName, () => App);

// Register background handler so notifications work when app is killed
notifee.onBackgroundEvent(async ({ type, detail }) => {
  // Handle notification press in background/killed state
  return;
});

// Register headless task for react-native-background-actions
AppRegistry.registerHeadlessTask('RNBackgroundActions', () => async (taskData) => {
  const { poll, seedState } = require('./lib/notificationWorker');
  await seedState();
  const delay = taskData?.delay || 15000;
  while (true) {
    await poll();
    await new Promise(r => setTimeout(r, delay));
  }
});
