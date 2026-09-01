// App entry (SPEC-implementation.md §17.2). The background task + notification-category
// definitions must be registered before `expo-router` mounts, so a headless (app-killed)
// JS start still has them. This file replaces `expo-router/entry` as `package.json` "main".
import './src/services/tasks';
import 'expo-router/entry';
