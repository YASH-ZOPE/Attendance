// Firebase Configuration
// Loaded dynamically at runtime from .env (window.ENV) or AWS Amplify build injection
const getEnvVar = (key) => {
    if (typeof window !== 'undefined' && window.ENV && window.ENV[key]) {
        return window.ENV[key];
    }
    return "";
};

const FIREBASE_CONFIG = {
    apiKey: getEnvVar("FIREBASE_API_KEY"),
    authDomain: getEnvVar("FIREBASE_AUTH_DOMAIN"),
    databaseURL: getEnvVar("FIREBASE_DATABASE_URL"),
    projectId: getEnvVar("FIREBASE_PROJECT_ID"),
    storageBucket: getEnvVar("FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getEnvVar("FIREBASE_MESSAGING_SENDER_ID"),
    appId: getEnvVar("FIREBASE_APP_ID")
};

// Secondary Timetable Realtime Database URL
window.TIMETABLE_FIREBASE_DB_URL = getEnvVar("TIMETABLE_FIREBASE_DB_URL");

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
    window.firebaseDB = firebase.database();
}
