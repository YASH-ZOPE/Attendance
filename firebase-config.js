// Firebase Configuration
// Environment values injected via window.ENV_CONFIG or build environment variables
const FIREBASE_CONFIG = {
    apiKey: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.FIREBASE_API_KEY) || (typeof process !== 'undefined' && process.env && process.env.FIREBASE_API_KEY) || "",
    authDomain: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.FIREBASE_AUTH_DOMAIN) || (typeof process !== 'undefined' && process.env && process.env.FIREBASE_AUTH_DOMAIN) || "",
    databaseURL: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.FIREBASE_DATABASE_URL) || (typeof process !== 'undefined' && process.env && process.env.FIREBASE_DATABASE_URL) || "",
    projectId: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.FIREBASE_PROJECT_ID) || (typeof process !== 'undefined' && process.env && process.env.FIREBASE_PROJECT_ID) || "",
    storageBucket: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.FIREBASE_STORAGE_BUCKET) || (typeof process !== 'undefined' && process.env && process.env.FIREBASE_STORAGE_BUCKET) || "",
    messagingSenderId: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.FIREBASE_MESSAGING_SENDER_ID) || (typeof process !== 'undefined' && process.env && process.env.FIREBASE_MESSAGING_SENDER_ID) || "",
    appId: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.FIREBASE_APP_ID) || (typeof process !== 'undefined' && process.env && process.env.FIREBASE_APP_ID) || ""
};

// Global Timetable Firebase Database URL for cross-project timetable auto-sync
window.TIMETABLE_FIREBASE_DB_URL = (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.TIMETABLE_FIREBASE_DB_URL)
    || (typeof process !== 'undefined' && process.env && process.env.TIMETABLE_FIREBASE_DB_URL)
    || "";

// Initialize Firebase
if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey) {
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }
    window.firebaseDB = firebase.database();
}
