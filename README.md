# Smart Attendance System (Frontend Portal)

A secure, high-performance, and responsive web portal for biometric attendance tracking. The application uses on-device face recognition (via TensorFlow.js/`face-api.js`), AWS Cognito for identity federation, and Firebase Realtime Database for live synchronization and session control.

---

## 🚀 Key Features

### 1. Biometric Face Recognition
- **On-Device Detection:** Utilizes `face-api.js` (Tiny Face Detector, Face Landmark 68, and Face Recognition models) to perform on-device face matching.
- **Biometric Enrollment:** Allows teachers/admins to register student faces individually or run bulk imports using structured dataset directories (`Dataset/StudentID_StudentName/image.jpg`).
- **Targeted Matching:** Automatically filters the search space to the selected division, ensuring high-speed recognition and avoiding matching conflicts.

### 2. Double-Factor Session Validation
- **QR Code Scanning:** Students scan a secure class QR code containing session parameters (department, course, division, subject, date, and `qrId`).
- **Dynamic Security Code:** To prevent proxy attendance, a 4-digit code rotates on the teacher's screen every 8 seconds. Students must enter this code to unlock their camera and log attendance.

### 3. Role-Based Dashboards
- **Admins:** Manage system metadata (departments, courses, subjects) and access full attendance and leave panels.
- **Teachers:** Generate QR session codes, update attendance manually, configure monthly holidays, track student attendance percentages, and approve/reject leave applications.
- **Students:** Register personal metadata, submit leave applications, view live attendance summaries, and verify identity via face recognition.

### 4. Dual-Mode Storage & Offline Fallback
- **Firebase Live Sync:** Real-time synchronization of session configs and attendance markers.
- **IndexedDB Fallback:** Instantiates client-side offline storage (`FaceRecognitionDB` and `SmartAttendanceDB`) to cache descriptors and attendance logs when offline.

---

## 🛠️ Tech Stack

- **Core:** HTML5, Vanilla JavaScript (ES6)
- **Styling:** Bootstrap 5, Bootstrap Icons, Vanilla CSS
- **Authentication:** AWS Cognito (Amazon Cognito Identity SDK)
- **Database & Sync:** Firebase Compat SDK (Auth & Realtime Database)
- **Computer Vision:** `face-api.js` (v0.22.2 compat/vladmandic)
- **Utilities:** `jsQR` (QR code decoder), `qrcode-generator` (QR encoder)

---

## 📁 File Structure

```text
Attendance/
├── cognito-config.js       # AWS Cognito Client SDK settings
├── firebase-config.js      # Firebase Database Client configuration
├── auth.js                 # Authentication manager (Cognito <-> Firebase token exchange)
├── cloud-storage.js        # Firebase Realtime Database operations wrapper
├── face-storage.js         # Offline IndexedDB storage manager
├── index.html              # Login, Registration, & Verification portal
├── profile.html            # Student metadata configuration portal
├── main-system.html        # Main admin, teacher, and student dashboard
├── face-recognition.html   # Biometric tracking and face capture viewport
├── face-recognition.js     # Orchestrator for camera streams, face matching, and QR sessions
├── leave-applications.html # Leave management dashboard UI
└── leave.js                # Leave applications business logic and API requests
```

---

## ⚙️ Configuration Setup

Before running the frontend, configure your cloud services by updating the following config files:

### 1. AWS Cognito (`cognito-config.js`)
Replace the placeholder credentials with your Cognito User Pool details:
```javascript
const COGNITO_CONFIG = {
    region: 'YOUR_AWS_REGION',                    // e.g., 'ap-south-1'
    userPoolId: 'YOUR_COGNITO_USER_POOL_ID',      // e.g., 'ap-south-1_xxxxxxxxx'
    clientId: 'YOUR_COGNITO_CLIENT_APP_ID'        // e.g., '6qhlvd3rkvj3rlegcmcgcdtnav'
};
```

### 2. Firebase Client Config (`firebase-config.js`)
Initialize the Firebase SDK with your app's web parameters:
```javascript
const FIREBASE_CONFIG = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

---

## 🔒 Security Flow

The client operates on a secure token exchange model:

1. **Authentication:** User logs in via `index.html` using AWS Cognito.
2. **Token Fetching:** Client requests a custom Firebase Token from the backend API `/api/firebase-token`, authorizing with the Cognito Identity JWT.
3. **Session Promotion:** Client logs into Firebase using `signInWithCustomToken()`.
4. **Authorized Databases:** Firebase rules check the claims (`role`, `department`, `course`, `division`) encoded in the custom token before allowing write operations.
5. **Class Verification:** The client checks if the scanned QR is active in the database and sends the 4-digit code to the backend for cryptographic validation before unlocking the webcam.
