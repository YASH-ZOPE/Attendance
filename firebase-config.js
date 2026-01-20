// Firebase Configuration
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDGInZ72P_8hJ99rlWsnmFqWRxlP4jT6sY",
    authDomain: "smartattendancesystem-d0c44.firebaseapp.com",
    databaseURL: "https://smartattendancesystem-d0c44-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smartattendancesystem-d0c44",
    storageBucket: "smartattendancesystem-d0c44.firebasestorage.app",
    messagingSenderId: "529762295158",
    appId: "1:529762295158:web:9995589071b1beb42f6e57"
};

// Initialize Firebase
firebase.initializeApp(FIREBASE_CONFIG);

// Get database reference
const database = firebase.database();

// Export for use in other files
window.firebaseDB = database;