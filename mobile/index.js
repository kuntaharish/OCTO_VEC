/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import notifee from '@notifee/react-native';

AppRegistry.registerComponent(appName, () => App);

// Register background handler — store pending nav action for when app resumes
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === 1 /* EventType.PRESS */ && detail.notification?.data?.action) {
    // Store in global so App.tsx can pick it up when nav is ready
    global.__pendingNotifNav = detail.notification.data;
  }
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
