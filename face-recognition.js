/**
 * face-recognition.js
 * Face Recognition Core Module
 * Main logic for face detection, recognition, and attendance marking
 */ 

class FaceRecognitionSystem {
  constructor() {
    this.video = document.getElementById('video');
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.storage = null;

    this.isModelLoaded = false;
    this.isCameraRunning = false;
    this.currentMode = 'recognition'; // 'register', 'recognition', or 'bulkImport'
    this.detectionInterval = null;
    this.faceMatcher = null;
    this.recognizedToday = new Set();
    this.unknownCount = 0;
    
    this.DETECTION_INTERVAL = 500; // ms between detections
    this.MATCH_THRESHOLD = 0.6; // Lower = stricter matching
    this.ATTENDANCE_COOLDOWN = 3000; // ms cooldown after marking attendance
    this.lastAttendanceTime = {};
    
    // Bulk import properties
    this.selectedFiles = null;

    this.currentQRId = null;
    this.qrExpirationListener = null;
    // Main system database reference
    this.mainDB = null;
    this.firebaseSync = null;
    this.mainSystemConfig = {
  currentDate: null,
  selectedSubject: null,
  selectedMonth: null,
  selectedYear: null,
  currentDay: null,
  selectedDepartment: null,
  selectedCourse: null,
  selectedAcademicYear: null,
  selectedDivision: null
};
       this.isHandlingDayChange = false;
       this.userRole = null;
  }
//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>         version           >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  /**
   * Initialize the system
   */
  async init() {
  try {
    // ✅ CHECK AUTHENTICATION FIRST
    const user = await getCurrentUser();
    
    if (!user) {
      // Not logged in - redirect
      window.location.href = 'index.html';
      return;
    }
    
    // Get role
    const role = await getUserRole();
    window.currentUserRole = role; // Store globally
    
    this.userRole = role; // ✅ WORKS - adds property to class
  console.log(`Logged in as: ${user.attributes.email} (${role})`);

// ✅ Get division from Cognito
const divisionInfo = await getDivisionAttributes();

if (divisionInfo.department && divisionInfo.course && divisionInfo.academicYear && divisionInfo.division) {
  this.mainSystemConfig.selectedDepartment = divisionInfo.department;
  this.mainSystemConfig.selectedCourse = divisionInfo.course;
  this.mainSystemConfig.selectedAcademicYear = divisionInfo.academicYear;
  this.mainSystemConfig.selectedDivision = divisionInfo.division;
  
  console.log('✅ Division loaded from Cognito:', divisionInfo);
} else {
  console.warn('⚠️ User missing division attributes');
  this.showToast('⚠️ Your account is missing division info. Contact admin.', 'warning');
}

if (role === 'student') {
      console.log('🔄 Student login - Clearing saved session');
      localStorage.removeItem('faceRecDivisionConfig');
      
      // Lock camera button
      this.disableCameraButton();
      
      // ✅ Reset code verification UI
      const codeSection = document.getElementById('securityCodeSection');
      const codeInput = document.getElementById('securityCodeInput');
      const successIcon = document.getElementById('codeSuccessIcon');
      const loadingSpinner = document.getElementById('codeLoadingSpinner');
      const validationMsg = document.getElementById('codeValidationMsg');
      
      if (codeSection) codeSection.style.display = 'none';
      if (codeInput) {
        codeInput.value = '';
        codeInput.disabled = false;
      }
      if (successIcon) successIcon.style.display = 'none';
      if (loadingSpinner) loadingSpinner.style.display = 'none';
      if (validationMsg) validationMsg.style.display = 'none';
      
      // Show welcome message
      this.showToast(
        '👋 Welcome Student!\n\n' +
        '📱 Please scan the QR code from your teacher to begin.\n' +
        '🔒 Camera is locked until QR + code verified.',
        'info'
      );
    } else {
      // For admin/teacher, enable camera immediately
      this.enableCameraButton();
    }
       // ✅ CONTINUE WITH EXISTING INITIALIZATION
    this.showLoading();
    // ✅ INITIALIZE CLOUD STORAGE WITH FALLBACK
    try {
      await cloudStorage.init();
      this.storage = cloudStorage;
      console.log('✅ Using Firebase Cloud Storage');
      this.showToast('Connected to cloud storage', 'success');
    } catch (cloudError) {
      console.warn('⚠️ Cloud storage unavailable, using local storage fallback');
      console.error('Cloud error:', cloudError);
      await faceStorage.init();
      this.storage = faceStorage;
      this.showToast('Using offline storage (cloud unavailable)', 'warning');
    }
    // ... rest of your existing init code

    try {
      this.firebaseSync = new FirebaseLiveSync();
      await this.firebaseSync.init();
      
      
// Teachers/admins read directly from Firebase via forceReadFirebaseData()
const savedConfig = localStorage.getItem('faceRecDivisionConfig');

if (savedConfig && this.userRole === 'student') {
  const config = JSON.parse(savedConfig);
  
  const configAge = Date.now() - config.scannedAt;
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  if (configAge < maxAge) {
    // Setup listeners for students
    this.firebaseSync.setupLiveListeners({
      department: config.department,
      course: config.course,
      academicYear: config.academicYear,
      division: config.division,
      year: config.year,
      onSubjectChange: (newSubject, oldSubject) => this.handleFirebaseSubjectChange(newSubject, oldSubject),
      onMonthChange: (newMonth, oldMonth) => this.handleFirebaseMonthChange(newMonth, oldMonth),
      onYearChange: (newYear, oldYear) => this.handleFirebaseYearChange(newYear, oldYear),
      onDayChange: (newDay, oldDay) => this.handleFirebaseDayChange(newDay, oldDay)
    });
    console.log('✅ Firebase listeners attached for student');
  } else {
    console.log('⚠️ Saved config expired - cleared');
    localStorage.removeItem('faceRecDivisionConfig');
  }
}

      console.log('✅ Firebase live sync enabled');
    } catch (error) {
      console.error('⚠️ Firebase live sync failed:', error);
    }

      
      // Show loading overlay
      this.showLoading();
      
      // Connect to main system database
      await this.connectToMainSystem();
      // ✅ FIX 2: Only load saved config for admin/teacher
    const savedConfig = localStorage.getItem('faceRecDivisionConfig');
    if (savedConfig && this.userRole !== 'student') {
      const config = JSON.parse(savedConfig);
      
      // ✅ FIX 5: Check if config is not too old
      const configAge = Date.now() - config.scannedAt;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (configAge < maxAge) {
        this.mainSystemConfig.selectedDepartment = config.department;
        this.mainSystemConfig.selectedCourse = config.course;
        this.mainSystemConfig.selectedAcademicYear = config.academicYear;
        this.mainSystemConfig.selectedDivision = config.division;
        this.mainSystemConfig.selectedSubject = config.subject;
        this.mainSystemConfig.selectedMonth = config.month;
        this.mainSystemConfig.selectedYear = config.year;
        this.mainSystemConfig.currentDay = config.day;
        console.log('✅ Loaded saved QR config for admin/teacher:', config);
      } else {
        console.log('⚠️ Saved config expired - cleared');
        localStorage.removeItem('faceRecDivisionConfig');
      }
    } else if (this.userRole === 'student') {
      console.log('⏳ Student mode - Waiting for QR scan');
    }
      await this.checkForDayChange();

      // Load face-api.js models
      await this.loadModels();
      
      // Setup event listeners
      this.setupEventListeners();
      await this.checkForDayChange();
    
    // ✅ CONTINUOUS READ - Every 30 seconds
    this.continuousReadInterval = setInterval(async () => {
      console.log('⏰ Running continuous Firebase read...');
      await this.forceReadFirebaseData();
    }, 30 * 1000); // 30 seconds
    
    // ✅ ALSO CHECK FOR DAY CHANGE EVERY 5 MINUTES
    this.dateCheckInterval = setInterval(() => {
      this.checkForDayChange();
    }, 5 * 60 * 1000);

      // Check for day changes
      await this.checkForDayChange();

      // Load and display registered students
      await this.updateStudentList();
      await this.updateStats();
      this.updateConfigDisplay();
      // Hide loading overlay
      this.hideLoading();
      
      this.showToast('System ready! You can start using face recognition.', 'success');
    } catch (error) {
      console.error('Initialization error:', error);
      this.showToast('Failed to initialize system: ' + error.message, 'danger');
      this.hideLoading();
    }
  }

async validateQRSession(qrId) {
  if (!this.firebaseSync || !this.firebaseSync.isConnected) {
    console.warn('⚠️ Cannot validate - Firebase offline');
    return false; // ✅ Allow offline mode
  }
  
  try {
    const snapshot = await this.firebaseSync.firebaseDB
      .ref(`mainSystem/activeQRs/${qrId}`).once('value');
    const qrData = snapshot.val();
    
    if (!qrData) {
      console.warn('⚠️ QR not found in Firebase');
      return false;
    }
    
    const now = Date.now();
    if (now > qrData.expiresAt) {
      console.warn('⚠️ QR expired');
      return false;
    }
    
    console.log('✅ QR is valid');
    return true;
    
  } catch (error) {
    console.error('❌ Validation error:', error);
    return true; // ✅ On error, allow (fail open)
  }
}

async handleQRScan(qrDataString) {
  try {
    console.log('═══════════════════════════════════');
    console.log('RAW QR DATA:', qrDataString);
    console.log('═══════════════════════════════════');
    const qrData = JSON.parse(qrDataString);
    
    // ✅ STRICT: Require QR ID
    if (!qrData.qrId) {
      this.showToast(
        '❌ INVALID QR CODE!\n\n' +
        'This QR code is outdated or missing required data.\n\n' +
        'Please generate a NEW QR code from the main system.',
        'danger'
      );
      console.error('❌ QR rejected - missing qrId');
      return;
    }
    
    // ✅ NEW: VALIDATE DIVISION MATCH FOR STUDENTS
    if (this.userRole === 'student') {
      const userDept = this.mainSystemConfig.selectedDepartment;
      const userCourse = this.mainSystemConfig.selectedCourse;
      const userYear = this.mainSystemConfig.selectedAcademicYear;
      const userDiv = this.mainSystemConfig.selectedDivision;
      
      const qrDept = qrData.department;
      const qrCourse = qrData.course;
      const qrYear = qrData.academicYear;
      const qrDiv = qrData.division;
      
      // Check if QR matches student's division
      if (userDept !== qrDept || 
          userCourse !== qrCourse || 
          userYear !== qrYear || 
          userDiv !== qrDiv) {
        
        this.showToast(
          '❌ WRONG DIVISION!\n\n' +
          `This QR is for: ${qrDept}/${qrCourse}/${qrYear}/${qrDiv}\n\n` +
          `Your division: ${userDept}/${userCourse}/${userYear}/${userDiv}\n\n` +
          '⚠️ You can ONLY scan QR codes for YOUR OWN division!',
          'danger'
        );
        
        console.error('❌ QR rejected - division mismatch');
        return; // ❌ STOP - don't process
      }
      
      console.log('✅ Division verified - QR matches student division');
    }
    
    // ✅ Validate QR ID in Firebase
    console.log(`🔍 Validating QR ID: ${qrData.qrId}...`);
    
    if (!this.firebaseSync || !this.firebaseSync.isConnected) {
      this.showToast(
        '⚠️ Firebase Not Connected!\n\n' +
        'Cannot validate QR code without Firebase.\n' +
        'Please check your internet connection.',
        'danger'
      );
      return;
    }
    
    const isValid = await this.validateQRSession(qrData.qrId);
    
    if (!isValid) {
      this.showToast(
        '⚠️ QR CODE EXPIRED OR INVALID!\n\n' +
        'This QR code has expired or been replaced.\n\n' +
        'Please scan a NEW QR code.',
        'danger'
      );
      return;
    }
    
    // ✅ QR is valid - setup expiration watcher
    this.currentQRId = qrData.qrId;
    this.watchQRExpiration(qrData.qrId);
    console.log(`✅ QR validated successfully - ID: ${qrData.qrId}`);
    
    // ✅ FOR ADMIN/TEACHER: Allow division change
    // ✅ FOR STUDENTS: Division already validated above
    if (this.userRole !== 'student') {
      this.mainSystemConfig.selectedDepartment = qrData.department;
      this.mainSystemConfig.selectedCourse = qrData.course;
      this.mainSystemConfig.selectedAcademicYear = qrData.academicYear;
      this.mainSystemConfig.selectedDivision = qrData.division;
    }
    
    // ✅ Update subject/date config (allowed for all roles)
    this.mainSystemConfig.selectedSubject = qrData.subject;
    this.mainSystemConfig.selectedMonth = qrData.month;
    this.mainSystemConfig.selectedYear = qrData.year;
    this.mainSystemConfig.currentDay = qrData.day;
    
    // ✅ Save to localStorage (with role-based logic)
    const configToSave = {
      qrId: qrData.qrId,
      department: this.mainSystemConfig.selectedDepartment, // Use mainSystemConfig (not qrData for students)
      course: this.mainSystemConfig.selectedCourse,
      academicYear: this.mainSystemConfig.selectedAcademicYear,
      division: this.mainSystemConfig.selectedDivision,
      subject: qrData.subject,
      month: qrData.month,
      year: qrData.year,
      day: qrData.day,
      scannedAt: Date.now()
    };
    
    localStorage.setItem('faceRecDivisionConfig', JSON.stringify(configToSave));
    
    // ✅ Re-setup Firebase live listeners
    this.firebaseSync.detachListeners();
    this.firebaseSync.setupLiveListeners({
      department:   this.mainSystemConfig.selectedDepartment,
      course:       this.mainSystemConfig.selectedCourse,
      academicYear: this.mainSystemConfig.selectedAcademicYear,
      division:     this.mainSystemConfig.selectedDivision,
      year:         qrData.year,
      onSubjectChange: (newSubject, oldSubject) => this.handleFirebaseSubjectChange(newSubject, oldSubject),
      onMonthChange:   (newMonth, oldMonth)     => this.handleFirebaseMonthChange(newMonth, oldMonth),
      onYearChange:    (newYear, oldYear)       => this.handleFirebaseYearChange(newYear, oldYear),
      onDayChange:     (newDay, oldDay)         => this.handleFirebaseDayChange(newDay, oldDay)
    });
    console.log('✅ Live listeners attached for division');
    
    // ✅ Update UI
    this.updateConfigDisplay();
    
    // ✅ ALWAYS require code for students
    if (this.userRole === 'student') {
      // Lock camera button
  this.disableCameraButton();
  
  // ✅ CRITICAL: Clear any previous code entry state
  const codeInput = document.getElementById('securityCodeInput');
  const successIcon = document.getElementById('codeSuccessIcon');
  const loadingSpinner = document.getElementById('codeLoadingSpinner');
  const validationMsg = document.getElementById('codeValidationMsg');
  
  if (codeInput) {
    codeInput.value = '';
    codeInput.disabled = false;
  }
  if (successIcon) successIcon.style.display = 'none';
  if (loadingSpinner) loadingSpinner.style.display = 'none';
  if (validationMsg) validationMsg.style.display = 'none';
  
  // ✅ SHOW security code input section
  const codeSection = document.getElementById('securityCodeSection');
  if (codeSection) {
    codeSection.style.display = 'block';
  }
  
  // ✅ Auto-focus on code input
  setTimeout(() => {
    if (codeInput) codeInput.focus();
  }, 300);
  
  this.showToast(
    `✅ QR CODE SCANNED!\n\n` +
    `Now enter the 4-digit security code from the teacher's screen.`,
    'info'
  );
  
  // ✅ IMPORTANT: Don't load face data until code is verified
  console.log('⏳ Waiting for security code verification...');
  return; // ❌ STOP - don't load faces yet
    } else {
      // Admin/Teacher - no code needed
      this.enableCameraButton();
      
      // ✅ Load face data immediately for admin/teacher
      await this.loadFaceMatcher();
      await this.updateStudentList();
      await this.updateStats();
    }
    
    const divisionName = `${this.mainSystemConfig.selectedDepartment}/${this.mainSystemConfig.selectedCourse}/${this.mainSystemConfig.selectedAcademicYear}/${this.mainSystemConfig.selectedDivision}`;
    this.showToast(
      `✅ QR CODE ACCEPTED!\n\n` +
      `Division: ${divisionName}\n` +
      `Subject: ${qrData.subject}\n` +
      `QR ID: ${qrData.qrId.substring(0, 8)}...`,
      'success'
    );
    
  } catch (error) {
    this.showToast('❌ Invalid QR code format', 'danger');
    console.error('QR scan error:', error);
  }
}
  /**
   * Connect to main attendance system database
   */
   async connectToMainSystem() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('SmartAttendanceDB', 1);
    
    request.onsuccess = (event) => {
      this.mainDB = event.target.result;
      console.log('✅ Connected to main attendance system (SmartAttendanceDB)');
      
      // Verify the database has the appData store
      if (this.mainDB.objectStoreNames.contains('appData')) {
        console.log('✅ appData store found');
      } else {
        console.warn('⚠️ appData store NOT found - main system may not be initialized');
      }
      
      resolve();
    };
    
    request.onerror = (event) => {
      console.error('❌ Failed to connect to main system database:', event.target.error);
      console.warn('⚠️ Main system database not found - will create on first sync');
      resolve(); // Don't reject, just continue
    };
    
    request.onupgradeneeded = (event) => {
      // Create main system database if it doesn't exist
      const db = event.target.result;
      console.log('📦 Database upgrade needed - creating structure...');
      
      if (!db.objectStoreNames.contains('appData')) {
        db.createObjectStore('appData', { keyPath: 'key' });
        console.log('✅ Created appData object store');
      }
    };
  });
}


/**
 * Force read latest Firebase data (called periodically)
 */
async forceReadFirebaseData() {
  if (!this.firebaseSync || !this.firebaseSync.isConnected) {
    console.warn('⚠️ Firebase not connected, skipping force read');
    return;
  }
  
  try {
    console.log('🔄 Force reading Firebase data...');
    
    const year = this.mainSystemConfig.selectedYear;
    const dept = this.mainSystemConfig.selectedDepartment;
    const course = this.mainSystemConfig.selectedCourse;
    const academicYear = this.mainSystemConfig.selectedAcademicYear;
    const division = this.mainSystemConfig.selectedDivision;

    if (!dept || !course || !academicYear || !division) {
      console.warn('⚠️ Division not configured yet');
      return;
    }

    const basePath = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}`;
    const snapshot = await this.firebaseSync.firebaseDB.ref(basePath).once('value');
    const data = snapshot.val() || {};
    
    // Check each value and trigger handlers if changed
    const newDay = data.currentDay ?? null;
    const newSubject = data.selectedSubject || null;
    const newMonth = data.selectedMonth ?? null;
    const newYear = data.selectedYear || null;
    const newDate = data.currentDate || null;
     // ✅ ADD: Track division components
    
    
    // Day changed?
    if (newDay !== this.mainSystemConfig.currentDay) {
      console.log(`📅 Force read detected day change: ${this.mainSystemConfig.currentDay} → ${newDay}`);
      await this.handleFirebaseDayChange(newDay, this.mainSystemConfig.currentDay);
    }
    
    // Subject changed?
    if (newSubject !== this.mainSystemConfig.selectedSubject) {
      console.log(`📚 Force read detected subject change: ${this.mainSystemConfig.selectedSubject} → ${newSubject}`);
      await this.handleFirebaseSubjectChange(newSubject, this.mainSystemConfig.selectedSubject);
    }
    
    // Month changed?
    if (newMonth !== this.mainSystemConfig.selectedMonth) {
      console.log(`📅 Force read detected month change: ${this.mainSystemConfig.selectedMonth} → ${newMonth}`);
      await this.handleFirebaseMonthChange(newMonth, this.mainSystemConfig.selectedMonth);
    }
    
    // Year changed?
    if (newYear !== this.mainSystemConfig.selectedYear) {
      console.log(`📅 Force read detected year change: ${this.mainSystemConfig.selectedYear} → ${newYear}`);
      await this.handleFirebaseYearChange(newYear, this.mainSystemConfig.selectedYear);
    }
    
    // Date changed?
    if (newDate !== this.mainSystemConfig.currentDate) {
      console.log(`📅 Force read detected date change: ${this.mainSystemConfig.currentDate} → ${newDate}`);
      await this.handleFirebaseDateChange(newDate, this.mainSystemConfig.currentDate);
    }
       
    console.log('✅ Force read complete');
  } catch (error) {
    console.error('❌ Force read failed:', error);
  }
}

    /**
   * Check if day has changed and reset attendance if needed
   */
  /**
 * Enhanced day change detection - checks BOTH calendar date AND main system day
 */
 async checkForDayChange() {
  try {
    // Check if Firebase sync is active
    if (!this.firebaseSync || !this.firebaseSync.isConnected) {
      console.warn('⚠️ Firebase not connected, using local check');
      // Fallback to local storage
      const today = new Date().toDateString();
      const lastKnownDate = await faceStorage.getLastKnownDate();
      
      if (lastKnownDate && today !== lastKnownDate) {
        await this.handleDayChange('calendar-auto-reset');
        await faceStorage.setLastKnownDate(today);
      }
      
      if (!lastKnownDate) {
        await faceStorage.setLastKnownDate(today);
      }
      return;
    }
    
    // ✅ FIXED: Only READ from Firebase, never WRITE
    const firebaseDay = this.mainSystemConfig.currentDay;
    
    if (firebaseDay === null || firebaseDay === undefined) {
      console.log('⚠️ No day set in main system yet');
      return;
    }
    
    // Get what we think the current day should be from local storage
    const ourStoredDay = await this.storage.getCurrentDay();
    
    if (ourStoredDay !== null && ourStoredDay !== firebaseDay) {
      console.log(`📅 Day mismatch detected: Our=${ourStoredDay}, Firebase=${firebaseDay}`);
      // The Firebase listener will handle the reset automatically
      // DON'T call handleDayChange here - let the listener do it
    } else if (ourStoredDay === null) {
      // First time - store the current Firebase day
      console.log(`📅 First run - storing current day: ${firebaseDay}`);
      await this.storage.setCurrentDay(firebaseDay);
    }
    
  } catch (error) {
    console.error('Error checking day change:', error);
  }
}
/**
 * Handle date change from Firebase
 */
async handleFirebaseDayChange(newDay, oldDay) {
  // ✅ Prevent infinite loops with guard flag
  if (this.isHandlingDayChange) {
    console.log('⚠️ Already handling day change, skipping...');
    return;
  }
  
  console.log(`🔔 Firebase day changed: ${oldDay} → ${newDay}`);
  
  const previousDay = this.mainSystemConfig.currentDay;
  this.mainSystemConfig.currentDay = newDay;
  this.updateConfigDisplay();
  
  // ✅ Handle day 0 properly and check for actual change
  if (newDay !== null && newDay !== undefined && newDay !== previousDay) {
    this.isHandlingDayChange = true; // ✅ Set guard to prevent re-entry
    
    try {
      console.log(`📅 Day changed from ${previousDay} to ${newDay} - FORCING RESET`);
      
      // Clear in-memory tracking IMMEDIATELY
      this.recognizedToday.clear();
      this.lastAttendanceTime = {};
      
      // Reset database
      await this.handleDayChange(`day-${newDay}`);
      
      
      // Update UI
      await this.updateStudentList();
      await this.updateStats();
      
      if (this.userRole === 'student') {
      const today = new Date().getDate();
      
      if (newDay !== today) {
        this.showToast(
          `📅 Day changed to Day ${newDay}\n\n` +
          `⚠️ NOTE: As a student, you can VIEW this date,\n` +
          `but face recognition ONLY works for TODAY (Day ${today})`,
          'info'
        );
      } else {
        this.showToast(`📅 Day changed to TODAY (Day ${newDay}). Attendance cleared!`, 'info');
      }
    } else {
      this.showToast(`📅 Day changed to Day ${newDay}. Attendance cleared!`, 'info');
    }
      
    } catch (error) {
      console.error('Error handling day change:', error);
      this.showToast('Failed to handle day change', 'danger');
    } finally {
      this.isHandlingDayChange = false; // ✅ Always clear guard
    }
  }
}

/**
 * Handle subject change from Firebase
 */
async handleFirebaseSubjectChange(newSubject, oldSubject) {
  console.log(`🔔 Firebase subject changed: ${oldSubject} → ${newSubject}`);
  
  this.mainSystemConfig.selectedSubject = newSubject;
   this.updateConfigDisplay();
  
  if (!newSubject) {
    this.showToast('⚠️ No subject selected in main system', 'warning');
  } else {
    this.showToast(`📚 Subject changed to: ${newSubject}`, 'info');
  }
  
  // Reset attendance when subject changes
  if (oldSubject && oldSubject !== newSubject) {
    console.log('📚 Subject changed - resetting attendance');
    await this.handleDayChange('subject-change');
  }
  
  await this.loadFaceMatcher();
  await this.updateStudentList();
}

/**
 * Handle month change from Firebase
 */
async handleFirebaseMonthChange(newMonth, oldMonth) {
  console.log(`🔔 Firebase month changed: ${oldMonth} → ${newMonth}`);
  
  this.mainSystemConfig.selectedMonth = newMonth;
   this.updateConfigDisplay();
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  
  if (newMonth !== null && newMonth !== undefined) {
    this.showToast(`📅 Month changed to: ${monthNames[newMonth]}`, 'info');
    
    // Reset attendance when month changes
    if (oldMonth !== null && oldMonth !== newMonth) {
      console.log('📅 Month changed - resetting attendance');
      await this.handleDayChange('month-change');
    }
  }
}

/**
 * Handle year change from Firebase
 */
async handleFirebaseYearChange(newYear, oldYear) {
  console.log(`🔔 Firebase year changed: ${oldYear} → ${newYear}`);
  
  this.mainSystemConfig.selectedYear = newYear;
   this.updateConfigDisplay();
  
  if (newYear) {
    this.showToast(`📅 Year changed to: ${newYear}`, 'info');
    
    // Reset attendance when year changes
    if (oldYear && oldYear !== newYear) {
      console.log('📅 Year changed - resetting attendance');
      await this.handleDayChange('year-change');
    }
  }
}

/**
 * Handle day change from Firebase
 */
/**
 * Handle date change from Firebase
 */
async handleFirebaseDateChange(newDate, oldDate) {
  console.log(`🔔 Firebase date changed: ${oldDate} → ${newDate}`);
  this.mainSystemConfig.currentDate = newDate;
  
  // ✅ REMOVED: Don't try to update Firebase - just observe
  // The main system (index.html) manages the date
  
  this.showToast(`📅 Date updated: ${newDate}`, 'info');
}
 /**
>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
   * Handle day change - reset all attendance
   */
 async handleDayChange(newDay) {
  try {
    console.log(`🔄 Resetting attendance for: ${newDay}...`);
    
    // Clear in-memory tracking
    this.recognizedToday.clear();
    this.lastAttendanceTime = {};
    
    // Reset all attendance in database
    await this.storage.resetAllAttendance();
    
    // Update UI   
    await this.updateStudentList();
    await this.updateStats();
    
    // Better notifications based on reason
    if (newDay === 'calendar-auto-reset') {
      this.showToast('📅 New calendar day! All attendance reset.', 'info');
    } else if (newDay === 'subject-change') {
      this.showToast('📚 Subject changed! All attendance reset.', 'info');
    } else if (newDay === 'month-change') {
      this.showToast('📅 Month changed! All attendance reset.', 'info');
    } else if (newDay === 'year-change') {
      this.showToast('📅 Year changed! All attendance reset.', 'info');
    } else if (newDay && newDay.toString().startsWith('day-')) {
      this.showToast(`📅 Day changed to Day ${newDay.toString().replace('day-', '')}. Attendance reset.`, 'info');
    } else {
      this.showToast(`📅 Day changed to Day ${newDay}. All attendance reset.`, 'info');
    }
    
    console.log(`✅ Attendance reset complete`);
    
  } catch (error) {
    console.error('Error handling day change:', error);
    this.showToast('Failed to reset attendance for new day', 'danger');
  }
}
 
 /**
   * Load face-api.js models
   */
  async loadModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';
    
    try {
      this.updateProgress(20, 'Loading face detection model...');
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      
      this.updateProgress(50, 'Loading face landmarks model...');
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      
      this.updateProgress(80, 'Loading face recognition model...');
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      
      this.updateProgress(100, 'Models loaded successfully!');
      
      this.isModelLoaded = true;
      console.log('All models loaded successfully');
    } catch (error) {
      console.error('Model loading error:', error);
      throw new Error('Failed to load face recognition models');
    }
  }


  async validateDateForRole() {
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  if (!this.firebaseSync || !this.firebaseSync.isConnected) {
    return {
      valid: false,
      message: '⚠️ Firebase not connected. Please check your connection.'
    };
  }

  const selectedDay = this.mainSystemConfig.currentDay;
  const selectedMonth = this.mainSystemConfig.selectedMonth;
  const selectedYear = this.mainSystemConfig.selectedYear;

  if (selectedDay === null || selectedMonth === null || selectedYear === null) {
    return {
      valid: false,
      message: '⚠️ Please select a date in the main system first!'
    };
  }

  if (this.userRole === 'student') {
    if (selectedDay !== todayDay || 
        selectedMonth !== todayMonth || 
        selectedYear !== todayYear) {
      
      return {
        valid: false,
        message: `⚠️ STUDENTS CAN ONLY MARK ATTENDANCE FOR TODAY!\n\n` +
                 `Today is: ${todayDay} ${monthNames[todayMonth]} ${todayYear}\n` +
                 `Main system shows: ${selectedDay} ${monthNames[selectedMonth]} ${selectedYear}\n\n` +
                 `You can view other dates in the main system, but face recognition only works for today.`
      };
    }
    
    return {
      valid: true,
      targetDay: todayDay,
      targetMonth: todayMonth,
      targetYear: todayYear,
      message: `✅ Marking attendance for TODAY (${todayDay} ${monthNames[todayMonth]} ${todayYear})`
    };
    
  } else {
    return {
      valid: true,
      targetDay: selectedDay,
      targetMonth: selectedMonth,
      targetYear: selectedYear,
      message: `✅ Marking attendance for: ${selectedDay} ${monthNames[selectedMonth]} ${selectedYear}`
    };
  }
};


getMonthName(monthIndex) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthNames[monthIndex];
}



  /**
   * Start camera
   */
  async startCamera() {
    if (!this.isModelLoaded) {
      this.showToast('Please wait for models to load', 'warning');
      return;
    }

    try {

      const dateValidation = await this.validateDateForRole();
    
    if (!dateValidation.valid) {
      this.showToast(dateValidation.message, 'warning');
      return;
    }
    
    console.log(`📅 Starting camera - Will mark attendance to: ${dateValidation.targetDay}`);
    
   

      await this.checkForDayChange();
    


    // Log current day
    if (this.firebaseSync && this.firebaseSync.isConnected) {
      const currentDay = this.mainSystemConfig.currentDay;
      console.log(`📅 Starting camera - Current day is: Day ${currentDay || 'NOT SET'}`);
    }

       // ✅ AUTO-ACTIVATE RECOGNITION MODE FOR STUDENTS
      const userRole = window.currentUserRole || 'student';
      
      if (userRole === 'student') {
        // Force recognition mode for students
        this.currentMode = 'recognition';
        this.activateRecognitionMode();
        console.log('🎓 Student detected - Auto-activated Recognition Mode');
      } else if (this.currentMode !== 'register' && this.currentMode !== 'recognition' && this.currentMode !== 'bulkImport') {
        // For admin/teacher, default to recognition if no mode selected
        this.currentMode = 'recognition';
        this.activateRecognitionMode();
        console.log('👨‍🏫 Teacher/Admin - Defaulted to Recognition Mode');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      this.video.srcObject = stream;
      this.isCameraRunning = true;

      // Wait for video to be ready
      await new Promise(resolve => {
        this.video.onloadedmetadata = () => {
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
          resolve();
        };
      });

      // Update UI
      document.getElementById('startCameraBtn').style.display = 'none';
      document.getElementById('stopCameraBtn').style.display = 'block';
      this.updateStatusBadge('Camera Active', 'success');

      // Start detection
      this.startDetection();

      this.showToast('Camera started successfully', 'success');
    } catch (error) {
      console.error('Camera error:', error);
      this.showToast('Failed to access camera: ' + error.message, 'danger');
    }
  }

  /**
   * Helper: Activate recognition mode UI
   */
  activateRecognitionMode() {
    document.getElementById('recognitionMode').classList.add('active');
    document.getElementById('registerMode').classList.remove('active');
    if (document.getElementById('bulkImportMode')) {
      document.getElementById('bulkImportMode').classList.remove('active');
    }
    document.getElementById('recognitionControls').style.display = 'block';
    document.getElementById('registerControls').style.display = 'none';
    if (document.getElementById('bulkImportControls')) {
      document.getElementById('bulkImportControls').style.display = 'none';
    }
  }

  /**
   * Stop camera
   */
  stopCamera() {
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }

    this.isCameraRunning = false;
    this.stopDetection();

    // Update UI
    document.getElementById('startCameraBtn').style.display = 'block';
    document.getElementById('stopCameraBtn').style.display = 'none';
    this.updateStatusBadge('Camera Off', 'secondary');

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Start face detection loop
   */
  startDetection() {
    this.stopDetection(); // Clear any existing interval

    this.detectionInterval = setInterval(async () => {
  if (!this.isCameraRunning) return;

  try {
    // Check for day change before detecting
    await this.checkForDayChange();
    
    await this.detectFaces();
  } catch (error) {
    console.error('Detection error:', error);
  }
}, this.DETECTION_INTERVAL);
  }

  /**
   * Stop face detection loop
   */
  stopDetection() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  /**
   * Detect faces in video frame
   */
  async detectFaces() {
    const detections = await faceapi
      .detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (detections.length === 0) {
      this.updateStatusBadge('No Face Detected', 'warning');
      return;
    }

    // Draw detections
    detections.forEach(detection => {
      const box = detection.detection.box;
      
      // Draw bounding box
      this.ctx.strokeStyle = '#00ff00';
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(box.x, box.y, box.width, box.height);
    });

    // Process based on mode
    if (this.currentMode === 'recognition') {
      await this.recognizeFaces(detections);
    } else if (this.currentMode === 'register') {
      this.updateStatusBadge(`${detections.length} Face(s) Detected - Ready to Capture`, 'info');
      document.getElementById('captureBtn').disabled = detections.length === 0;
    }
  }

  /**
   * Recognize faces and mark attendance
   */
  async recognizeFaces(detections) {
    // Load face matcher if not already loaded
    if (!this.faceMatcher) {
      await this.loadFaceMatcher();
      if (!this.faceMatcher) {
        this.updateStatusBadge('No registered faces', 'warning');
        return;
      }
    }

    let recognizedCount = 0;
    let unknownCount = 0;

    for (const detection of detections) {
      const bestMatch = this.faceMatcher.findBestMatch(detection.descriptor);
      
      if (bestMatch.distance < this.MATCH_THRESHOLD) {
        // Face recognized
        const [studentId, studentName] = bestMatch.label.split('|');
        recognizedCount++;

        // Draw label
        const box = detection.detection.box;
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        this.ctx.fillRect(box.x, box.y - 30, box.width, 30);
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText(studentName, box.x + 5, box.y - 10);

        // Mark attendance (with cooldown)
        await this.markAttendanceWithCooldown(studentId, studentName);
      } else {
        // Unknown face
        unknownCount++;
        const box = detection.detection.box;
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        this.ctx.fillRect(box.x, box.y - 30, box.width, 30);
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillText('Unknown', box.x + 5, box.y - 10);
      }
    }

    this.unknownCount = unknownCount;
    this.updateStatusBadge(`Scanning: ${recognizedCount} recognized, ${unknownCount} unknown`, 'info');
    await this.updateStats();
  }

  /**
   * Mark attendance with cooldown to prevent duplicate marking
   */
  async markAttendanceWithCooldown(studentId, studentName) {
  const now = Date.now();
  const lastTime = this.lastAttendanceTime[studentId] || 0;

  if (now - lastTime < this.ATTENDANCE_COOLDOWN) {
    return;
  }

  // ✅ ADD THIS BLOCK:
  const dateValidation = await this.validateDateForRole();
  
  if (!dateValidation.valid) {
    this.showToast(
      `⚠️ Date validation failed!\n${dateValidation.message}\n\nCamera stopped.`,
      'danger'
    );
    this.stopCamera();
    return;
  }

  const success = await this.storage.markAttendance(studentId);
  
  if (success) {
    this.lastAttendanceTime[studentId] = now;
    
    if (!this.recognizedToday.has(studentId)) {
      this.recognizedToday.add(studentId);
      
      // ✅ CHANGE THIS LINE:
      const dateStr = `${dateValidation.targetDay} ${this.getMonthName(dateValidation.targetMonth)}`;
      this.showToast(`✓ Attendance marked for ${studentName}\nDate: ${dateStr}`, 'success');
      
      await this.updateStudentList();
    }
    await this.saveAttendanceToFirebase(studentId, studentName, dateValidation);
  }
}

async saveAttendanceToFirebase(studentId, studentName, dateValidation) {
  if (!this.firebaseSync || !this.firebaseSync.isConnected) {
    console.warn('⚠️ Firebase not connected - skipping auto-sync');
    return;
  }
  
  const subject = this.mainSystemConfig.selectedSubject;
  const month = this.mainSystemConfig.selectedMonth;
  const year = this.mainSystemConfig.selectedYear;
  const day = dateValidation.targetDay;
  
  if (!subject || month === null || year === null) {
    console.warn('⚠️ Cannot sync to Firebase - incomplete config');
    return;
  }
  
  // ✅ GET FULL PATH COMPONENTS
const dept = this.mainSystemConfig.selectedDepartment;
const course = this.mainSystemConfig.selectedCourse;
const academicYear = this.mainSystemConfig.selectedAcademicYear;
const division = this.mainSystemConfig.selectedDivision;

if (!dept || !course || !academicYear || !division) {
  console.warn('⚠️ Cannot sync - missing department/course/academic year/division');
  return;
}

const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

// ✅ USE 8-LEVEL PATH
const path = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}/months/${monthKey}/subjects/${subject}/attendance/${studentId}`;
  
  try {
    // Add timeout to prevent hanging
    const syncPromise = this.firebaseSync.firebaseDB.ref(path).update({
      _name: studentName,
      [day]: 'Present'
    });
    
    await Promise.race([
      syncPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]);
    
    console.log(`✅ Auto-synced ${studentName} to Firebase`);
  } catch (error) {
    console.error('⚠️ Firebase auto-sync failed:', error.message);
    // Don't throw - just log and continue
  }
}
  /**
   * Load face matcher from storage
   */
  async loadFaceMatcher() {
  // ✅ Get ALL faces first
  const allFaces = await this.storage.getAllFaces();
  
  // ✅ Filter by current division
  const dept = this.mainSystemConfig.selectedDepartment;
  const course = this.mainSystemConfig.selectedCourse;
  const academicYear = this.mainSystemConfig.selectedAcademicYear;
  const division = this.mainSystemConfig.selectedDivision;
  
  let labeledDescriptors;
  
  if (dept && course && academicYear && division) {
    // Filter faces that belong to current division
    const divisionFaces = allFaces.filter(face => 
      face.department === dept &&
      face.course === course &&
      face.academicYear === academicYear &&
      face.division === division
    );
    
    console.log(`✅ Filtered ${divisionFaces.length}/${allFaces.length} faces for division: ${dept}/${course}/${academicYear}/${division}`);
    
    labeledDescriptors = await this.storage.getLabeledDescriptors(divisionFaces);
  } else {
    // No division selected - use all faces (fallback)
    console.warn('⚠️ No division selected - loading all faces');
    labeledDescriptors = await this.storage.getLabeledDescriptors(allFaces);
  }
  
  if (labeledDescriptors.length === 0) {
    this.faceMatcher = null;
    return;
  }

  const labeledFaceDescriptors = labeledDescriptors.map(
    item => new faceapi.LabeledFaceDescriptors(item.label, item.descriptors)
  );

  this.faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, this.MATCH_THRESHOLD);
  console.log(`Face matcher loaded with ${labeledDescriptors.length} faces`);
}

  /**
 * Capture and register a face
 */
async captureFace() {
  const studentId = document.getElementById('studentIdInput').value.trim();
  const studentName = document.getElementById('studentNameInput').value.trim();

  if (!studentId || !studentName) {
    this.showToast('Please enter both Student ID and Name', 'warning');
    return;
  }
    // ✅ ADD: Check division is selected
  const dept = this.mainSystemConfig.selectedDepartment;
  const course = this.mainSystemConfig.selectedCourse;
  const academicYear = this.mainSystemConfig.selectedAcademicYear;
  const division = this.mainSystemConfig.selectedDivision;
  
  if (!dept || !course || !academicYear || !division) {
    this.showToast(
      '⚠️ Please select Department, Course, Academic Year, and Division in the main system first!',
      'warning'
    );
    return;
  }
  try {
    // ✅ Check if student already exists
    const existingFace = await this.storage.getFace(studentId);
    
    if (existingFace) {
      // Student already exists - ask what to do
      const action = await this.showFaceExistsDialog(existingFace);
      
      if (action === 'cancel') {
        this.showToast('Registration cancelled', 'info');
        return;
      }
      
      // If action is 'replace' or 'add', continue below
      // We'll handle it during save
    }

    // Detect face
    const detection = await faceapi
      .detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      this.showToast('No face detected. Please face the camera.', 'warning');
      return;
    }

    // Capture face image
    const box = detection.detection.box;
    const tempCanvas = document.createElement('canvas');
    const padding = 20;
    tempCanvas.width = box.width + padding * 2;
    tempCanvas.height = box.height + padding * 2;
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCtx.drawImage(
      this.video,
      box.x - padding, box.y - padding,
      box.width + padding * 2, box.height + padding * 2,
      0, 0,
      tempCanvas.width, tempCanvas.height
    );

    const imageData = tempCanvas.toDataURL('image/jpeg', 0.8);

    // ✅ Save based on user choice
    if (existingFace) {
      
      
      if (action === 'replace') {
        // Replace completely
        await this.storage.saveFace(studentId, studentName, detection.descriptor, imageData);
        this.showToast(`✓ Face replaced for ${studentName} (${studentId})`, 'success');
      } else if (action === 'add') {
        // Add to existing descriptors
        await this.storage.addFaceToExisting(studentId, studentName, detection.descriptor, imageData);
        this.showToast(`✓ Face added to existing record for ${studentName} (${studentId})`, 'success');
      } else {
        return; // Cancelled
      }
    } else {
      // New student - save normally
      await this.storage.saveFace(studentId, studentName, detection.descriptor, imageData);
      this.showToast(`✓ Face registered for ${studentName} (${studentId})`, 'success');
    }

    // Reload face matcher
    await this.loadFaceMatcher();

    // Update UI
    await this.updateStudentList();
    await this.updateStats();

    // Clear inputs
    document.getElementById('studentIdInput').value = '';
    document.getElementById('studentNameInput').value = '';

  } catch (error) {
    console.error('Face capture error:', error);
    this.showToast('Failed to capture face: ' + error.message, 'danger');
  }
}

    /**
 * Show dialog when face with same ID already exists
 */
async showFaceExistsDialog(existingFace) {
  return new Promise((resolve) => {
    const message = `⚠️ STUDENT ALREADY EXISTS\n\n` +
                    `ID: ${existingFace.id}\n` +
                    `Name: ${existingFace.name}\n` +
                    `Registered: ${new Date(existingFace.timestamp).toLocaleString()}\n` +
                    `Existing faces: ${existingFace.descriptors.length}\n\n` +
                    `What would you like to do?\n\n` +
                    `• REPLACE - Delete old data and save new face\n` +
                    `• ADD - Keep old faces and add this new one\n` +
                    `• CANCEL - Don't save anything`;
    
    const choice = prompt(message + '\n\nType: REPLACE, ADD, or CANCEL', 'ADD');
    
    if (!choice) {
      resolve('cancel');
      return;
    }
    
    const action = choice.trim().toLowerCase();
    
    if (action === 'replace') {
      if (confirm(`⚠️ This will DELETE all existing face data for ${existingFace.name}!\n\nAre you sure?`)) {
        resolve('replace');
      } else {
        resolve('cancel');
      }
    } else if (action === 'add') {
      resolve('add');
    } else {
      resolve('cancel');
    }
  });
}
  /**
   * Update student list UI
   */
  async updateStudentList() {
    const faces = await this.storage.getAllFaces();
    
     if (this.firebaseSync && this.firebaseSync.isConnected) {
      const day = this.mainSystemConfig.currentDay;
      const month = this.mainSystemConfig.selectedMonth;
      const year = this.mainSystemConfig.selectedYear;
      const subject = this.mainSystemConfig.selectedSubject;
      
      if (day && month !== null && month !== undefined && year && subject) {
        // ⚠️ CRITICAL FIX: Use month directly, no +1
        const dept = this.mainSystemConfig.selectedDepartment;
const course = this.mainSystemConfig.selectedCourse;
const academicYear = this.mainSystemConfig.selectedAcademicYear;
const division = this.mainSystemConfig.selectedDivision;

if (!dept || !course || !academicYear || !division) {
  console.warn('⚠️ Cannot read attendance - missing config');
  return;
}

const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
const path = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}/months/${monthKey}/subjects/${subject}/attendance`;
        
        try {
          console.log(`📥 Reading Firebase attendance from: ${path} for Day ${day}`);
          
          const snapshot = await this.firebaseSync.firebaseDB.ref(path).once('value');
          const firebaseData = snapshot.val() || {};
          
          console.log('Firebase data:', firebaseData);
          
          // Update each face with Firebase attendance status
          faces.forEach(face => {
            const studentData = firebaseData[face.id];
            if (studentData) {
              const dayStatus = studentData[day];
              console.log(`${face.id}: Day ${day} = ${dayStatus} (${typeof dayStatus})`);
              
              // ✅ Check ALL possible formats
              const isPresent = dayStatus === 'Present' || 
                               dayStatus === 'present' ||
                               dayStatus === true || 
                               dayStatus === 1 || 
                               dayStatus === '1';
              
              face.attendanceToday = isPresent;
              
              if (isPresent) {
                console.log(`✅ ${face.name} - PRESENT`);
              }
            } else {
              face.attendanceToday = false;
            }
          });
          
          console.log(`✅ Synced ${faces.filter(f => f.attendanceToday).length}/${faces.length} from Firebase`);
        } catch (error) {
          console.error('❌ Failed to read Firebase attendance:', error);
        }
      }
    }

    const listContainer = document.getElementById('studentList');

    if (faces.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center text-muted py-5">
          <i class="bi bi-person-x fs-1"></i>
          <p class="mt-2">No students registered yet</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = faces.map(face => `
      <div class="student-card" data-id="${face.id}">
        <img src="${face.imageData}" alt="${face.name}" class="face-preview">
        <div class="flex-grow-1">
          <h6 class="mb-1">${face.name}</h6>
          <small class="text-muted">ID: ${face.id}</small><br>
          <span class="badge ${face.attendanceToday ? 'bg-success' : 'bg-secondary'} mt-1">
            ${face.attendanceToday ? '✓ Present' : 'Not Marked'}
          </span>
        </div>
        <button class="btn btn-sm btn-outline-danger delete-face-btn" data-id="${face.id}">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `).join('');

    // Add delete event listeners
    document.querySelectorAll('.delete-face-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Delete this registered face?')) {
          await this.storage.deleteFace(id);
          await this.loadFaceMatcher();
          await this.updateStudentList();
          await this.updateStats();
          this.showToast('Face deleted', 'info');
        }
      });
    });
     await this.updateVisualAttendance();
  }
updateConfigDisplay() {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  const config = this.mainSystemConfig;
  
  // Field 1: Department - Academic year - Course - Div.
  const classInfo = [
    config.selectedDepartment,
    config.selectedAcademicYear,
    config.selectedCourse,
    config.selectedDivision
  ].filter(Boolean).join(' - ') || 'Not Set';
  
  const classInfoEl = document.getElementById('displayClassInfo');
  if (classInfoEl) {
    classInfoEl.textContent = classInfo;
    classInfoEl.classList.toggle('not-set', classInfo === 'Not Set');
  }
  
  // Field 2: Date (day - month - year)
  let dateStr = 'Not Set';
  if (config.currentDay && config.selectedMonth !== null && config.selectedYear) {
    const shortYear = config.selectedYear.toString().slice(-2);
    dateStr = `${config.currentDay} - ${monthNames[config.selectedMonth]} - ${shortYear}`;
  }
  
  const dateEl = document.getElementById('displayDate');
  if (dateEl) {
    dateEl.textContent = dateStr;
    dateEl.classList.toggle('not-set', dateStr === 'Not Set');
  }
  
  // Field 3: Subject
  const subject = config.selectedSubject || 'Not Set';
  const subjectEl = document.getElementById('displaySubject');
  if (subjectEl) {
    subjectEl.textContent = subject;
    subjectEl.classList.toggle('not-set', subject === 'Not Set');
  }
}

/**
 * Update visual attendance blocks display
 */
async updateVisualAttendance() {
  const faces = await this.storage.getAllFaces();

   if (this.firebaseSync && this.firebaseSync.isConnected) {
    const day = this.mainSystemConfig.currentDay;
    const month = this.mainSystemConfig.selectedMonth;
    const year = this.mainSystemConfig.selectedYear;
    const subject = this.mainSystemConfig.selectedSubject;
    
    if (day && month !== null && month !== undefined && year && subject) {
      const dept = this.mainSystemConfig.selectedDepartment;
const course = this.mainSystemConfig.selectedCourse;
const academicYear = this.mainSystemConfig.selectedAcademicYear;
const division = this.mainSystemConfig.selectedDivision;

if (!dept || !course || !academicYear || !division) {
  return;
}

const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
const path = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}/months/${monthKey}/subjects/${subject}/attendance`;
      
      try {
        const snapshot = await this.firebaseSync.firebaseDB.ref(path).once('value');
        const firebaseData = snapshot.val() || {};
        
        faces.forEach(face => {
          const studentData = firebaseData[face.id];
          if (studentData) {
            const dayStatus = studentData[day];
            const isPresent = dayStatus === 'Present' || dayStatus === 'present' || 
                             dayStatus === true || dayStatus === 1 || dayStatus === '1';
            face.attendanceToday = isPresent;
          } else {
            face.attendanceToday = false;
          }
        });
      } catch (error) {
        console.error('Failed to sync visual attendance:', error);
      }
    }
  }
  
  // Separate present and absent students
  const presentStudents = faces.filter(f => f.attendanceToday);
  const absentStudents = faces.filter(f => !f.attendanceToday);
  
  // Update counts
  document.getElementById('attendanceCount').textContent = 
    `${presentStudents.length}/${faces.length}`;
  document.getElementById('presentCount').textContent = presentStudents.length;
  document.getElementById('absentCount').textContent = absentStudents.length;
  
  // Render present blocks
  const presentContainer = document.getElementById('presentBlocks');
  if (presentStudents.length === 0) {
    presentContainer.innerHTML = `
      <div class="text-center text-muted py-3">
        <small>No students marked present</small>
      </div>
    `;
  } else {
    presentContainer.innerHTML = presentStudents.map(student => `
      <div class="attendance-block present" data-id="${student.id}">
        ${student.id}
        <span class="tooltip-text">
          ${student.name}<br>ID: ${student.id}<br>✓ Present
        </span>
      </div>
    `).join('');
  }
  
  // Render absent blocks
  const absentContainer = document.getElementById('absentBlocks');
  if (absentStudents.length === 0) {
    absentContainer.innerHTML = `
      <div class="text-center text-muted py-3">
        <small>All students present!</small>
      </div>
    `;
  } else {
    absentContainer.innerHTML = absentStudents.map(student => `
      <div class="attendance-block absent" data-id="${student.id}">
        ${student.id}
        <span class="tooltip-text">
          ${student.name}<br>ID: ${student.id}<br>✗ Absent
        </span>
      </div>
    `).join('');
  }
  
}
//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

  /**
   * Update statistics
   */
  async updateStats() {
    let faces = await this.storage.getAllFaces();
    
    if (this.firebaseSync && this.firebaseSync.isConnected) {
      const day = this.mainSystemConfig.currentDay;
      const month = this.mainSystemConfig.selectedMonth;
      const year = this.mainSystemConfig.selectedYear;
      const subject = this.mainSystemConfig.selectedSubject;
      
      if (day && month !== null && month !== undefined && year && subject) {
        const dept = this.mainSystemConfig.selectedDepartment;
const course = this.mainSystemConfig.selectedCourse;
const academicYear = this.mainSystemConfig.selectedAcademicYear;
const division = this.mainSystemConfig.selectedDivision;

if (!dept || !course || !academicYear || !division) {
  console.warn('⚠️ Cannot read stats - missing config');
  return;
}

const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
const path = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}/months/${monthKey}/subjects/${subject}/attendance`;
        
        try {
          const snapshot = await this.firebaseSync.firebaseDB.ref(path).once('value');
          const firebaseData = snapshot.val() || {};
          
          faces.forEach(face => {
            const studentData = firebaseData[face.id];
            if (studentData) {
              const dayStatus = studentData[day];
              const isPresent = dayStatus === 'Present' || dayStatus === 'present' || 
                               dayStatus === true || dayStatus === 1 || dayStatus === '1';
              face.attendanceToday = isPresent;
            } else {
              face.attendanceToday = false;
            }
          });
        } catch (error) {
          console.error('Failed to sync stats:', error);
        }
      }
    }
    
    const stats = {
      total: faces.length,
      presentToday: faces.filter(f => f.attendanceToday).length,
      absentToday: faces.filter(f => !f.attendanceToday).length
    };
    document.getElementById('statRegistered').textContent = stats.total;
    document.getElementById('statRecognized').textContent = stats.presentToday;
    document.getElementById('statUnknown').textContent = this.unknownCount;
    await this.updateVisualAttendance();
  }

  /**
   * Clear today's attendance
   */
  async clearTodayAttendance() {
  if (!confirm('Clear today\'s attendance for all students?')) return;

  await this.storage.resetAllAttendance(); // ✅ Use the new method
  this.recognizedToday.clear();
  this.lastAttendanceTime = {};
    
    await this.updateStudentList();
    await this.updateStats();
    
    this.showToast('Today\'s attendance cleared', 'info');
  }

  /**
   * Clear all faces
   */
  async clearAllFaces() {
    if (!confirm('⚠️ DELETE ALL REGISTERED FACES?\n\nThis action cannot be undone!')) return;

    await this.storage.clearAllFaces();
    this.faceMatcher = null;
    this.recognizedToday.clear();
    this.lastAttendanceTime = {};
    
    await this.updateStudentList();
    await this.updateStats();
    
    this.showToast('All faces cleared', 'warning');
  }

  /**
   * Handle folder selection
   */
  handleFolderSelection(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) {
      this.showToast('No files selected', 'warning');
      return;
    }

    // Group files by student folder
    this.selectedFiles = this.groupFilesByStudent(files);
    
    // Show preview
    this.showImportPreview(this.selectedFiles);
    
    // Enable start button
    document.getElementById('startImportBtn').disabled = false;
  }

  /**
 * Group files by student ID (folder name)
 */
groupFilesByStudent(files) {
  const grouped = {};
  
  files.forEach(file => {
    // Extract student ID from path
    // Path format: Dataset/StudentID_StudentName/image.jpg
    const pathParts = file.webkitRelativePath.split('/');
    
    if (pathParts.length < 3) {
      console.warn('Invalid file path:', file.webkitRelativePath);
      return;
    }
    
    const folderName = pathParts[1]; // Get folder name (e.g., "101_JohnDoe")
    
    // Parse ID and Name from folder name
    let studentId, studentName;
    
    if (folderName.includes('_')) {
      // Format: ID_Name (e.g., "101_JohnDoe")
      const parts = folderName.split('_');
      studentId = parts[0].trim();
      studentName = parts.slice(1).join('_').trim(); // Join in case name has underscores
    } else {
      // Fallback: Use folder name as both ID and Name
      studentId = folderName.trim();
      studentName = folderName.trim();
      console.warn(`Folder "${folderName}" doesn't follow ID_Name format. Using as both ID and Name.`);
    }
    
    // Validate image file
    if (!this.isValidImageFile(file)) {
      console.warn('Invalid image file:', file.name);
      return;
    }
    
    // Group by student ID
    if (!grouped[studentId]) {
      grouped[studentId] = {
        name: studentName,
        files: []
      };
    }
    grouped[studentId].files.push(file);
  });
  
  return grouped;
}

  /**
   * Validate image file
   */
  isValidImageFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!validTypes.includes(file.type)) {
      return false;
    }
    
    if (file.size > maxSize) {
      console.warn(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return false;
    }
    
    return true;
  }

  /**
 * Show import preview
 */
showImportPreview(filesByStudent) {
  const studentIds = Object.keys(filesByStudent);
  const totalImages = Object.values(filesByStudent).reduce((sum, data) => sum + data.files.length, 0);
  
  let html = `
    <div class="alert alert-success mb-2">
      <strong>✓ Found:</strong> ${studentIds.length} students, ${totalImages} images
    </div>
    <div class="list-group">
  `;
  
  studentIds.forEach(studentId => {
    const studentData = filesByStudent[studentId];
    const imageCount = studentData.files.length;
    html += `
      <div class="list-group-item">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <i class="bi bi-person-badge me-2"></i>
            <strong>ID:</strong> ${studentId} 
            <span class="text-muted">|</span> 
            <strong>Name:</strong> ${studentData.name}
          </div>
          <span class="badge bg-primary">${imageCount} image${imageCount > 1 ? 's' : ''}</span>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  document.getElementById('previewContent').innerHTML = html;
  document.getElementById('importPreview').style.display = 'block';
}
  /**
 * Start bulk import process
 */
async startBulkImport() {
  if (!this.selectedFiles || Object.keys(this.selectedFiles).length === 0) {
    this.showToast('No files selected', 'warning');
    return;
  }

  // ✅ VALIDATE DIVISION IS SELECTED
  const dept = this.mainSystemConfig.selectedDepartment;
  const course = this.mainSystemConfig.selectedCourse;
  const academicYear = this.mainSystemConfig.selectedAcademicYear;
  const division = this.mainSystemConfig.selectedDivision;
  
  if (!dept || !course || !academicYear || !division) {
    this.showToast(
      '❌ DIVISION NOT SELECTED!\n\n' +
      'Please select Department, Course, Academic Year, and Division in the main system before importing faces.',
      'danger'
    );
    return;
  }

  // ✅ SHOW CONFIRMATION WITH DIVISION INFO
  const studentCount = Object.keys(this.selectedFiles).length;
  const totalImages = Object.values(this.selectedFiles).reduce((sum, data) => sum + data.files.length, 0);
  
  const confirmed = confirm(
    `📋 BULK IMPORT CONFIRMATION\n\n` +
    `Import Target:\n` +
    `├─ Department: ${dept}\n` +
    `├─ Course: ${course}\n` +
    `├─ Academic Year: ${academicYear}\n` +
    `└─ Division: ${division}\n\n` +
    `Import Data:\n` +
    `├─ Students: ${studentCount}\n` +
    `└─ Total Images: ${totalImages}\n\n` +
    `⚠️ All faces will be registered to this division only.\n\n` +
    `Continue with import?`
  );
  
  if (!confirmed) {
    this.showToast('Import cancelled', 'info');
    return;
  }

  // ✅ Check for existing students
  const studentIds = Object.keys(this.selectedFiles);
  const conflicts = [];
  
  for (const studentId of studentIds) {
    const existing = await this.storage.getFace(studentId);
    if (existing) {
      conflicts.push({
        id: studentId,
        name: this.selectedFiles[studentId].name,
        existingName: existing.name,
        existingFaces: existing.descriptors.length
      });
    }
  }

  // If conflicts exist, ask user what to do
  let bulkAction = 'add'; // Default action
  
  if (conflicts.length > 0) {
    const conflictMsg = `⚠️ ${conflicts.length} STUDENT(S) ALREADY EXIST:\n\n` +
                       conflicts.map(c => `• ID: ${c.id} (${c.existingName}) - ${c.existingFaces} existing faces`).join('\n') +
                       `\n\nWhat would you like to do?\n\n` +
                       `• REPLACE - Delete old data and import new\n` +
                       `• ADD - Keep old faces and add new ones\n` +
                       `• SKIP - Only import new students\n` +
                       `• CANCEL - Stop import`;
    
    const choice = prompt(conflictMsg + '\n\nType: REPLACE, ADD, SKIP, or CANCEL', 'ADD');
    
    if (!choice || choice.trim().toLowerCase() === 'cancel') {
      this.showToast('Import cancelled', 'info');
      return;
    }
    
    bulkAction = choice.trim().toLowerCase();
    
    if (!['replace', 'add', 'skip'].includes(bulkAction)) {
      this.showToast('Invalid choice. Import cancelled.', 'warning');
      return;
    }
  }

  // Show progress modal
  document.getElementById('importProgressModal').style.display = 'block';
  
  const allStudentIds = Object.keys(this.selectedFiles);
  const results = {
    total: allStudentIds.length,
    success: [],
    failed: [],
    skipped: []
  };

  // Process each student
  for (let i = 0; i < allStudentIds.length; i++) {
    const studentId = allStudentIds[i];
    const studentData = this.selectedFiles[studentId];
    const studentName = studentData.name;
    const files = studentData.files;
    
    // Update progress
    const progress = Math.round(((i + 1) / allStudentIds.length) * 100);
    document.getElementById('importProgressBar').style.width = `${progress}%`;
    document.getElementById('importProgressText').textContent = 
      `Processing ${i + 1} of ${allStudentIds.length} students...`;
    document.getElementById('importProgressDetail').textContent = 
      `Current: ${studentName} (ID: ${studentId}, ${files.length} images)`;
    
    try {
      // Check if this student exists
      const existing = await this.storage.getFace(studentId);
      
      // Handle based on user's bulk action choice
      if (existing && bulkAction === 'skip') {
        // Skip this student
        results.skipped.push({
          id: studentId,
          name: studentName,
          existingFaces: existing.descriptors.length
        });
        continue;
      }

      // Process all images for this student
      const descriptors = await this.processStudentImages(studentId, files);
      
      if (descriptors.length === 0) {
        throw new Error('No faces detected in any image');
      }

      // ✅ Save based on action (saveBulkFaces will use mainSystemConfig for division)
      if (existing && bulkAction === 'add') {
        // Add to existing record
        await this.storage.addBulkFacesToExisting(studentId, studentName, descriptors, files[0]);
      } else {
        // Replace or new student
        await this.storage.saveBulkFaces(studentId, studentName, descriptors, files[0]);
      }
      
      results.success.push({
        id: studentId,
        name: studentName,
        imageCount: files.length,
        descriptorCount: descriptors.length,
        action: existing ? (bulkAction === 'add' ? 'Added to existing' : 'Replaced') : 'New',
        division: `${dept}/${course}/${academicYear}/${division}` // ✅ Track division in results
      });
      
    } catch (error) {
      console.error(`Failed to process ${studentId}:`, error);
      results.failed.push({
        id: studentId,
        name: studentName, // ✅ Add name to failed results
        error: error.message
      });
    }
  }

  // Reload face matcher with division filter
  await this.loadFaceMatcher();
  
  // Update UI
  await this.updateStudentList();
  await this.updateStats();
  
  // Hide progress modal
  document.getElementById('importProgressModal').style.display = 'none';
  
  // Show results
  this.showImportResults(results);
  
  // ✅ Show final summary with division
  if (results.success.length > 0) {
    this.showToast(
      `✅ IMPORT COMPLETE!\n\n` +
      `Imported ${results.success.length} students to:\n` +
      `${dept} > ${course} > ${academicYear} > ${division}`,
      'success'
    );
  }
}
  /**
   * Process all images for one student
   */
  async processStudentImages(studentId, files) {
    const descriptors = [];
    
    for (const file of files) {
      try {
        const descriptor = await this.extractFaceDescriptor(file);
        if (descriptor) {
          descriptors.push(descriptor);
        }
      } catch (error) {
        console.warn(`Failed to process ${file.name}:`, error.message);
      }
    }
    
    return descriptors;
  }

  /**
   * Extract face descriptor from image file
   */
  async extractFaceDescriptor(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          // Create image element
          const img = document.createElement('img');
          img.src = e.target.result;
          
          await new Promise(resolve => img.onload = resolve);
          
          // Detect face
          const detection = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();
          
          if (!detection) {
            reject(new Error('No face detected'));
            return;
          }
          
          resolve(detection.descriptor);
          
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Show import results
   */
  showImportResults(results) {
  let html = `
    <div class="row mb-3">
      <div class="col-md-3">
        <div class="text-center">
          <h2 class="text-primary">${results.total}</h2>
          <small>Total Students</small>
        </div>
      </div>
      <div class="col-md-3">
        <div class="text-center">
          <h2 class="text-success">${results.success.length}</h2>
          <small>Successfully Imported</small>
        </div>
      </div>
      
      <div class="col-md-3">
        <div class="text-center">
          <h2 class="text-warning">${results.skipped?.length || 0}</h2>
          <small>Skipped</small>
        </div>
      </div>
     
      <div class="col-md-3">
        <div class="text-center">
          <h2 class="text-danger">${results.failed.length}</h2>
          <small>Failed</small>
        </div>
      </div>
    </div>
  `;
  
  // Success list
  if (results.success.length > 0) {
    html += `
      <h6 class="text-success">✓ Successfully Imported:</h6>
      <div class="list-group mb-3">
    `;
    results.success.forEach(item => {
      html += `
        <div class="list-group-item list-group-item-success">
          <strong>${item.name}</strong> (ID: ${item.id}) - ${item.descriptorCount} faces from ${item.imageCount} images
          <span class="badge bg-info ms-2">${item.action || 'Imported'}</span>
        </div>
      `;
    });
    html += `</div>`;
  }
  
  //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> ADD SKIPPED SECTION
  // Skipped list
  if (results.skipped && results.skipped.length > 0) {
    html += `
      <h6 class="text-warning">⊘ Skipped (Already Exist):</h6>
      <div class="list-group mb-3">
    `;
    results.skipped.forEach(item => {
      html += `
        <div class="list-group-item list-group-item-warning">
          <strong>${item.name}</strong> (ID: ${item.id}) - Already has ${item.existingFaces} registered faces
        </div>
      `;
    });
    html += `</div>`;
  }
  //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> END ADD
  
  // Failed list
  if (results.failed.length > 0) {
    html += `
      <h6 class="text-danger">✗ Failed to Import:</h6>
      <div class="list-group">
    `;
    results.failed.forEach(item => {
      html += `
        <div class="list-group-item list-group-item-danger">
          <strong>${item.id}</strong> - ${item.error}
        </div>
      `;
    });
    html += `</div>`;
  }
  
  document.getElementById('importResultsContent').innerHTML = html;
  document.getElementById('importResultsModal').style.display = 'block';
  
  // Show toast
  if (results.success.length > 0) {
    this.showToast(
      `✓ Successfully imported ${results.success.length} students!`,
      'success'
    );
  }
}

  /**
   * Cancel bulk import
   */
  cancelBulkImport() {
    document.getElementById('folderInput').value = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('startImportBtn').disabled = true;
    this.selectedFiles = null;
    this.showToast('Import cancelled', 'info');
  }

  /**
   * Test connection to main system
   */
  async testMainSystemConnection() {
  try {
    // Reconnect
    await this.connectToMainSystem();


    // Get main system state with detailed logging
    console.log('=== READING MAIN SYSTEM DATA ===');
    const snapshot = await this.firebaseSync.firebaseDB.ref('mainSystem').once('value');
const data = snapshot.val() || {};
const selectedSubject = data.selectedSubject;
const selectedMonth = data.selectedMonth;
const selectedYear = data.selectedYear;
const currentDay = data.currentDay;

const subjectsSnapshot = await this.firebaseSync.firebaseDB.ref('subjects').once('value');
const subjects = subjectsSnapshot.val();
    console.log('=== READ COMPLETE ===');

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];

    let report = '🔍 MAIN SYSTEM CONNECTION TEST\n\n';
    
    if (this.mainDB) {
      report += '✅ Database: Connected\n';
      report += `   Name: SmartAttendanceDB\n`;
      report += `   Version: ${this.mainDB.version}\n`;
    } else {
      report += '❌ Database: Not Found\n';
    }

    report += '\n📊 CURRENT CONFIGURATION:\n';
    report += `Subject: ${selectedSubject || '❌ NOT SET'}\n`;
    report += `Month: ${selectedMonth !== null && selectedMonth !== undefined ? `${monthNames[selectedMonth]} (index: ${selectedMonth})` : '❌ NOT SET'}\n`;
    report += `Year: ${selectedYear || '❌ NOT SET'}\n`;
    report += `Current Day: ${currentDay || '❌ NOT SET'}\n`;
    report += `Available Subjects: ${subjects?.length || 0}\n`;

    if (subjects && subjects.length > 0) {
      report += `  → ${subjects.join(', ')}\n`;
    }

    report += '\n';

    if (!selectedSubject || selectedMonth === null || selectedMonth === undefined) {
      report += '⚠️ ACTION REQUIRED:\n';
      report += '1. Open index.html in a NEW TAB (same browser)\n';
      report += '2. Add and select a subject\n';
      report += '3. Select month and click "Apply Month"\n';
      report += '4. Click the DEBUG button to verify data is saved\n';
      report += '5. Return here and click "Refresh Status"\n';
      report += '6. Then click "Sync to Main System"\n';
    } else {
      report += '✅ READY TO SYNC!\n';
      report += 'Click "Sync to Main System" to transfer attendance.\n';
    }

    console.log(report);
    alert(report);

    if (selectedSubject && selectedMonth !== null && selectedMonth !== undefined) {
      this.showToast('✅ Connection successful! Ready to sync.', 'success');
    } else {
      this.showToast('⚠️ Configuration incomplete. See details.', 'warning');
    }

  } catch (error) {
    console.error('Connection test failed:', error);
    alert(`❌ CONNECTION FAILED\n\nError: ${error.message}\n\nMake sure:\n1. index.html has been opened at least once\n2. You're using the SAME browser\n3. IndexedDB is enabled in your browser`);
    this.showToast('Connection test failed', 'danger');
  }
}

  /**
 * Refresh connection and reload main system data
 */
async refreshMainSystemStatus() {
  try {
    // Reconnect
    await this.connectToMainSystem();
    
    // Force reload all data
    const selectedSubject = await this.getFromMainDB('selectedSubject');
    const selectedMonth = await this.getFromMainDB('selectedMonth');
    const selectedYear = await this.getFromMainDB('selectedYear');
    const currentDay = await this.getFromMainDB('currentDay');
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Update UI or show status
    let statusMsg = '📊 MAIN SYSTEM STATUS (REFRESHED)\n\n';
    statusMsg += `Subject: ${selectedSubject || '❌ NOT SET'}\n`;
    statusMsg += `Month: ${selectedMonth !== null && selectedMonth !== undefined ? monthNames[selectedMonth] : '❌ NOT SET'}\n`;
    statusMsg += `Year: ${selectedYear || '❌ NOT SET'}\n`;
    statusMsg += `Day: ${currentDay || '❌ NOT SET'}\n\n`;
    
    if (selectedSubject && selectedMonth !== null && selectedMonth !== undefined) {
      statusMsg += '✅ READY TO SYNC!';
      this.showToast('✅ Connection refreshed! Ready to sync.', 'success');
    } else {
      statusMsg += '⚠️ Please configure main system first!';
      this.showToast('⚠️ Main system not fully configured', 'warning');
    }
    
    console.log(statusMsg);
    alert(statusMsg);
    
  } catch (error) {
    console.error('Refresh failed:', error);
    this.showToast('❌ Failed to refresh connection', 'danger');
  }
}

  /**
   * Sync attendance to main system - IMPROVED VERSION
   */
  /**
 * Sync attendance to main system - IMPROVED VERSION
 */
async syncToMainSystem() {
  try {
    // Reconnect to main DB if needed
    if (!this.mainDB) {
      await this.connectToMainSystem();
    }

    // Check for day change before syncing
    await this.checkForDayChange();

    const attendanceData = await this.storage.exportAttendanceData();

    // ✅ FILTER: Only get students marked "Present"
    const presentStudents = attendanceData.filter(student => student.status === 'Present');
    
    
    if (attendanceData.length === 0) {
      this.showToast('No attendance data to sync', 'warning');
      return;
    }
      // ✅ CHANGE THIS - Use Firebase config instead of IndexedDB
    let selectedSubject, selectedMonth, selectedYear, currentDay;
    
    if (this.firebaseSync && this.firebaseSync.isConnected) {
      // Use live Firebase data
      selectedSubject = this.mainSystemConfig.selectedSubject;
      selectedMonth = this.mainSystemConfig.selectedMonth;
      selectedYear = this.mainSystemConfig.selectedYear;
      currentDay = this.mainSystemConfig.currentDay || 1;
      
      console.log('✅ Using Firebase live config for sync');
    } else {
      // Fallback to IndexedDB
      selectedSubject = await this.getFromMainDB('selectedSubject');
      selectedMonth = await this.getFromMainDB('selectedMonth');
      selectedYear = await this.getFromMainDB('selectedYear');
      currentDay = await this.getFromMainDB('currentDay') || 1;
      
      console.log('⚠️ Using IndexedDB fallback for sync');
    }
    
    // DEBUG
    console.log('=== SYNC DEBUG ===');
    console.log('Subject:', selectedSubject);
    console.log('Month:', selectedMonth, typeof selectedMonth);
    console.log('Year:', selectedYear);
    console.log('Day:', currentDay);
    console.log('==================');

    // Validation
    if (!selectedSubject) {
      this.showToast('❌ Please select a SUBJECT in the main system first!', 'danger');
      this.showDetailedSyncHelp();
      return;
    }

    if (selectedMonth === null || selectedMonth === undefined || typeof selectedMonth !== 'number') {
      this.showToast('❌ Please select a MONTH in the main system first!', 'danger');
      this.showDetailedSyncHelp();
      return;
    }

    // Get existing attendance data
    const snapshot = await this.firebaseSync.firebaseDB.ref('attendanceData').once('value');
let allAttendanceData = snapshot.val() || {};

    // ⚠️ FIX: Match main system's month key format (no +1)
    // Main system uses 0-11 directly: "2026-00" for January
    const dept = this.mainSystemConfig.selectedDepartment;
const course = this.mainSystemConfig.selectedCourse;
const academicYear = this.mainSystemConfig.selectedAcademicYear;
const division = this.mainSystemConfig.selectedDivision;

if (!dept || !course || !academicYear || !division) {
  this.showToast('❌ Missing department/course/academic year/division config!', 'danger');
  return;
}

const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

// ✅ CREATE 8-LEVEL STRUCTURE
if (!allAttendanceData[selectedYear]) allAttendanceData[selectedYear] = {};
if (!allAttendanceData[selectedYear][dept]) allAttendanceData[selectedYear][dept] = {};
if (!allAttendanceData[selectedYear][dept][course]) allAttendanceData[selectedYear][dept][course] = {};
if (!allAttendanceData[selectedYear][dept][course][academicYear]) allAttendanceData[selectedYear][dept][course][academicYear] = {};
if (!allAttendanceData[selectedYear][dept][course][academicYear][division]) {
  allAttendanceData[selectedYear][dept][course][academicYear][division] = { months: {} };
}
if (!allAttendanceData[selectedYear][dept][course][academicYear][division].months[monthKey]) {
  allAttendanceData[selectedYear][dept][course][academicYear][division].months[monthKey] = { subjects: {} };
}
if (!allAttendanceData[selectedYear][dept][course][academicYear][division].months[monthKey].subjects[selectedSubject]) {
  allAttendanceData[selectedYear][dept][course][academicYear][division].months[monthKey].subjects[selectedSubject] = { attendance: {} };
}

    // Update attendance
    let syncedCount = 0;
    const attendanceTarget = allAttendanceData[selectedYear][dept][course][academicYear][division].months[monthKey].subjects[selectedSubject].attendance;

    attendanceData.forEach(student => {
      if (!attendanceTarget[student.id]) {
        attendanceTarget[student.id] = {
          _name: student.name
        };
      }
      
      attendanceTarget[student.id][currentDay] = student.status;
      syncedCount++;
    });

    // Save back to main system
    // Save back to main system - UPDATE ONLY THE SPECIFIC MONTH/SUBJECT
// ✅ SAVE TO 8-LEVEL PATH
const savePath = `mainSystem/attendanceData/${selectedYear}/${dept}/${course}/${academicYear}/${division}/months/${monthKey}/subjects/${selectedSubject}/attendance`;

await this.firebaseSync.firebaseDB
  .ref(savePath)
  .set(allAttendanceData[selectedYear][dept][course][academicYear][division].months[monthKey].subjects[selectedSubject].attendance);

console.log(`✅ Saved to Firebase: ${savePath}`);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    this.showToast(
      `✅ SUCCESS! Synced ${syncedCount} students to ${monthNames[selectedMonth]} ${selectedYear}, Day ${currentDay}`, 
      'success'
    );
    
    this.showSyncConfirmation(syncedCount, selectedSubject, currentDay);

    // ✅ Trigger refresh of main system
    await this.triggerMainSystemRefresh();

  } catch (error) {
    console.error('Sync error:', error);
    this.showToast('❌ Sync failed: ' + error.message, 'danger');
  }
}

async debugFirebaseAttendance() {
  if (!this.firebaseSync || !this.firebaseSync.isConnected) {
    alert('❌ Firebase not connected!');
    return;
  }
  
  const day = this.mainSystemConfig.currentDay;
  const month = this.mainSystemConfig.selectedMonth;
  const year = this.mainSystemConfig.selectedYear;
  const subject = this.mainSystemConfig.selectedSubject;
  
  const dept = this.mainSystemConfig.selectedDepartment;
const course = this.mainSystemConfig.selectedCourse;
const academicYear = this.mainSystemConfig.selectedAcademicYear;
const division = this.mainSystemConfig.selectedDivision;

if (!dept || !course || !academicYear || !division) {
  alert('❌ Missing department/course/academic year/division config!');
  return;
}

const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
const path = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}/months/${monthKey}/subjects/${subject}/attendance`;
  
  try {
    const snapshot = await this.firebaseSync.firebaseDB.ref(path).once('value');
    const data = snapshot.val();
    
    console.log('=== FIREBASE DEBUG ===');
    console.log('Path:', path);
    console.log('Day:', day);
    console.log('Data:', data);
    
    if (!data) {
      alert('❌ NO DATA at path: ' + path);
      return;
    }
    
    let report = `Path: ${path}\nDay: ${day}\n\n`;
    
    Object.keys(data).forEach(studentId => {
      const studentData = data[studentId];
      const dayStatus = studentData[day];
      report += `${studentId}: ${studentData._name}\n`;
      report += `  Day ${day} = ${dayStatus}\n\n`;
    });
    
    console.log(report);
    alert(report);
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
}

      /**
 * Trigger main system (index.html) to refresh its data
 */
async triggerMainSystemRefresh() {
  try {
    // Set a refresh flag in the database
    await this.saveToMainDB('_refreshRequired', {
      timestamp: Date.now(),
      source: 'face-recognition',
      reason: 'attendance-sync'
    });
    
    console.log('✅ Refresh trigger sent to main system');
    
    // Use BroadcastChannel API to notify other tabs (if supported)
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('attendance-system');
      channel.postMessage({
        type: 'REFRESH_REQUIRED',
        source: 'face-recognition',
        timestamp: Date.now()
      });
      channel.close();
      console.log('✅ Broadcast message sent to refresh main system');
    }
    
  } catch (error) {
    console.error('Failed to trigger main system refresh:', error);
    // Non-critical error, don't throw
  }
}
  /**
   * Get data from main system database
   */
   async getFromMainDB(key) {
  return new Promise((resolve, reject) => {
    if (!this.mainDB) {
      console.warn(`❌ Cannot read '${key}': Database not connected`);
      resolve(null);
      return;
    }

    try {
      const transaction = this.mainDB.transaction(['appData'], 'readonly');
      const store = transaction.objectStore('appData');
      const request = store.get(key);

      request.onsuccess = () => {
        const value = request.result?.value;
        console.log(`✓ Read '${key}' from main DB:`, value);
        resolve(value !== undefined ? value : null);
      };

      request.onerror = () => {
        console.error(`❌ Error reading '${key}' from main DB:`, request.error);
        resolve(null);
      };
    } catch (error) {
      console.error(`❌ Transaction error reading '${key}':`, error);
      resolve(null);
    }
  });
}

  /**
   * Save data to main system database
   */
  async saveToMainDB(key, value) {
    return new Promise((resolve, reject) => {
      if (!this.mainDB) {
        reject(new Error('Main database not connected'));
        return;
      }

      try {
        const transaction = this.mainDB.transaction(['appData'], 'readwrite');
        const store = transaction.objectStore('appData');
        const request = store.put({ key: key, value: value });

        request.onsuccess = () => {
          console.log(`✓ Saved ${key} to main system`);
          resolve();
        };

        request.onerror = () => {
          console.error('Error saving to main DB:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Transaction error:', error);
        reject(error);
      }
    });
  }
// Method 1: Validate QR
async validateQRSession(qrId) {
  const snapshot = await this.firebaseSync.firebaseDB
    .ref(`mainSystem/activeQRs/${qrId}`).once('value');
  const qrData = snapshot.val();
  
  if (!qrData || Date.now() > qrData.expiresAt) return false;
  return true;
}

// Method 2: Watch for expiration
watchQRExpiration(qrId) {
  if (!this.firebaseSync || !this.firebaseSync.isConnected) return;
  
  // ✅ Remove old listener if exists
  if (this.qrExpirationListener) {
    this.qrExpirationListener.off();
  }
  
  const qrRef = this.firebaseSync.firebaseDB.ref(`mainSystem/activeQRs/${qrId}`);
  
  const handler = (snapshot) => {
    const qrData = snapshot.val();
    
    if (!qrData) {
      console.warn('⚠️ QR removed from Firebase');
      this.handleQRExpiration('removed');
      qrRef.off('value', handler);
      return;
    }
    
    if (Date.now() > qrData.expiresAt) {
      console.warn('⚠️ QR expired');
      this.handleQRExpiration('expired');
      qrRef.off('value', handler);
    }
  };
  
  qrRef.on('value', handler);
  this.qrExpirationListener = qrRef; // ✅ Store reference
  console.log(`👁️ Watching QR: ${qrId}`);
}
// Method 3: Handle expiration
handleQRExpiration(reason) {
  if (this.isCameraRunning) this.stopCamera();
  
  this.showToast(
    reason === 'expired' 
      ? '⏰ QR Code Expired! Scan new QR.' 
      : '🔄 QR Replaced! Scan new QR.',
    'warning'
  );
  
  this.currentQRId = null;
}
  /**
   * Show detailed sync help
   */
  showDetailedSyncHelp() {
    const helpMessage = `
📋 HOW TO FIX:

1. Open index.html in a NEW TAB
2. In "Subject Management" section:
   - Add a subject (e.g., "Mathematics")
   - Select it from dropdown
3. In "Month & Calendar" section:
   - Choose month and year
   - Click "Apply Month"
4. Come back to this tab
5. Click "Sync to Main System" again

⚠️ Both systems must use the SAME BROWSER!
    `;
    
    console.log(helpMessage);
    alert(helpMessage);
  }

  /**
   * Show sync confirmation dialog
   */
  showSyncConfirmation(count, subject, day) {
    const message = `
✅ SYNC SUCCESSFUL!

📊 Details:
• Students synced: ${count}
• Subject: ${subject}
• Day: ${day}

✓ Data has been transferred to the main attendance system.
✓ Open index.html to view updated attendance.
    `;
    
    console.log(message);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Camera controls
    document.getElementById('startCameraBtn').addEventListener('click', () => this.startCamera());
    document.getElementById('stopCameraBtn').addEventListener('click', () => this.stopCamera());

    // Mode selection
    document.getElementById('registerMode').addEventListener('click', () => {
  this.currentMode = 'register';
  document.getElementById('registerMode').classList.add('active');
  document.getElementById('recognitionMode').classList.remove('active');
  if (document.getElementById('bulkImportMode')) {
    document.getElementById('bulkImportMode').classList.remove('active');
  }
  document.getElementById('registerControls').style.display = 'block';
  document.getElementById('recognitionControls').style.display = 'none';
  if (document.getElementById('bulkImportControls')) {
    document.getElementById('bulkImportControls').style.display = 'none';
  }
  this.updateStatusBadge('Register Mode', 'primary');
});

document.getElementById('recognitionMode').addEventListener('click', () => {
  this.currentMode = 'recognition';
  document.getElementById('recognitionMode').classList.add('active');
  document.getElementById('registerMode').classList.remove('active');
  if (document.getElementById('bulkImportMode')) {
    document.getElementById('bulkImportMode').classList.remove('active');
  }
  document.getElementById('recognitionControls').style.display = 'block';
  document.getElementById('registerControls').style.display = 'none';
  if (document.getElementById('bulkImportControls')) {
    document.getElementById('bulkImportControls').style.display = 'none';
  }
  this.updateStatusBadge('Recognition Mode', 'success');
});

    // Capture face button
    document.getElementById('captureBtn').addEventListener('click', () => this.captureFace());

    // Clear today's attendance
    document.getElementById('clearTodayBtn').addEventListener('click', () => this.clearTodayAttendance());

    // Clear all faces
    document.getElementById('clearAllFacesBtn').addEventListener('click', () => this.clearAllFaces());

    // Test connection
    document.getElementById('testConnectionBtn').addEventListener('click', () => this.testMainSystemConnection());
    // Refresh status (if button exists)
    const refreshBtn = document.getElementById('refreshStatusBtn');
    if (refreshBtn) {
    refreshBtn.addEventListener('click', () => this.refreshMainSystemStatus());
    }

    // Sync to main system
    document.getElementById('syncToMainBtn').addEventListener('click', () => this.syncToMainSystem());

    // Set default mode to recognition
    document.getElementById('recognitionMode').click();
    if (this.userRole === 'student') {
    this.disableCameraButton();
  }

     const forceReadBtn = document.getElementById('forceReadBtn');
  if (forceReadBtn) {
    forceReadBtn.addEventListener('click', async () => {
      forceReadBtn.disabled = true;
      forceReadBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Reading...';
      
      await this.forceReadFirebaseData();
      
      forceReadBtn.disabled = false;
      forceReadBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Force Read Firebase Now';
      
      this.showToast('✅ Firebase data refreshed!', 'success');
    });
  }
const debugBtn = document.getElementById('debugFirebaseBtn');
if (debugBtn) {
  debugBtn.addEventListener('click', () => this.debugFirebaseAttendance());
}

    // Bulk Import Mode
document.getElementById('bulkImportMode').addEventListener('click', () => {
  this.currentMode = 'bulkImport';
  document.getElementById('bulkImportMode').classList.add('active');
  document.getElementById('registerMode').classList.remove('active');
  document.getElementById('recognitionMode').classList.remove('active');
  document.getElementById('bulkImportControls').style.display = 'block';
  document.getElementById('registerControls').style.display = 'none';
  document.getElementById('recognitionControls').style.display = 'none';
  this.updateStatusBadge('Bulk Import Mode', 'info');
  
  // Stop camera if running
  if (this.isCameraRunning) {
    this.stopCamera();
  }
});

// Folder selection
document.getElementById('folderInput').addEventListener('change', (e) => {
  this.handleFolderSelection(e);
});

// Start import button
document.getElementById('startImportBtn').addEventListener('click', () => {
  this.startBulkImport();
});

// Cancel import button
document.getElementById('cancelImportBtn').addEventListener('click', () => {
  this.cancelBulkImport();
});

// Close results button
document.getElementById('closeResultsBtn').addEventListener('click', () => {
  document.getElementById('importResultsModal').style.display = 'none';
});

 const verifyBtn = document.getElementById('verifyCodeBtn');
const codeInput = document.getElementById('securityCodeInput');
const loadingSpinner = document.getElementById('codeLoadingSpinner'); // ✅ NEW
const successIcon = document.getElementById('codeSuccessIcon'); // ✅ NEW

if (verifyBtn && codeInput) {
  
  // ✅ AUTO-VERIFY on input (when 4 digits entered)
  codeInput.addEventListener('input', async (e) => {
    const enteredCode = e.target.value.trim();
    
    // Only allow numbers
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    
    // Hide success icon when typing
    if (successIcon) successIcon.style.display = 'none';
    
    // Auto-verify when 4 digits entered
    if (e.target.value.length === 4) {
      console.log('✅ 4 digits entered - auto-verifying...');
      
      // Show loading spinner
      if (loadingSpinner) loadingSpinner.style.display = 'block';
      
      // Disable input during verification
      codeInput.disabled = true;
      
      // Small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify code from Firebase
      const verification = await this.verifyDynamicCode(e.target.value);
      
      // Hide loading spinner
      if (loadingSpinner) loadingSpinner.style.display = 'none';
      
      if (verification.valid) {
  // ✅ Code is valid
  if (successIcon) successIcon.style.display = 'block';
  
  this.showCodeSuccess('✅ Code verified! Loading face data...');
  this.enableCameraButton();
  
  // ✅ NOW load the face data (was blocked in handleQRScan)
  try {
    await this.loadFaceMatcher();
    await this.updateStudentList();
    await this.updateStats();
    
    this.showToast('✅ System ready! You can now start the camera.', 'success');
    
  } catch (error) {
    console.error('Failed to load face data:', error);
    this.showCodeError('Failed to load face data. Please try again.');
    this.disableCameraButton();
    
    // Re-enable code input for retry
    codeInput.value = '';
    codeInput.disabled = false;
    if (successIcon) successIcon.style.display = 'none';
    codeInput.focus();
    return;
  }
  
  // Clear input after brief delay
  setTimeout(() => {
    codeInput.value = '';
    codeInput.disabled = false;
  }, 1000);
} else {
        // ❌ Code is invalid - allow retry
        this.showCodeError(verification.reason);
        
        // Clear input and re-enable for retry
        codeInput.value = '';
        codeInput.disabled = false;
        
        // Focus back on input
        codeInput.focus();
      }
    }
  });
  
  // ✅ Manual verify button (hidden but still functional)
  verifyBtn.addEventListener('click', async () => {
    const enteredCode = codeInput.value.trim();
    
    if (enteredCode.length !== 4) {
      this.showCodeError('Please enter a 4-digit code');
      codeInput.focus();
      return;
    }
    
    // Show loading
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    codeInput.disabled = true;
    
    const verification = await this.verifyDynamicCode(enteredCode);
    
    if (loadingSpinner) loadingSpinner.style.display = 'none';
    
    if (verification.valid) {
      if (successIcon) successIcon.style.display = 'block';
      this.showCodeSuccess('✅ Code verified! You can now start the camera.');
      this.enableCameraButton();
      
      setTimeout(() => {
        codeInput.value = '';
        codeInput.disabled = false;
      }, 1000);
      
    } else {
      this.showCodeError(verification.reason);
      codeInput.value = '';
      codeInput.disabled = false;
      codeInput.focus();
    }
  });
  
  // ✅ Auto-focus on input when section appears
  if (this.userRole === 'student') {
    setTimeout(() => {
      if (document.getElementById('securityCodeSection').style.display !== 'none') {
        codeInput.focus();
      }
    }, 500);
  }

}
  }

  /**
   * UI Helper Methods
   */
  updateStatusBadge(text, type) {
    const badge = document.getElementById('statusBadge');
    badge.className = `status-badge bg-${type}`;
    badge.innerHTML = `<i class="bi bi-camera-video${type === 'secondary' ? '-off' : ''} me-2"></i>${text}`;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toastNotification');
    const toastBody = toast.querySelector('.toast-body');
    
    toast.className = `toast align-items-center border-0 bg-${type} text-white`;
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast, { delay: 5000 });
    bsToast.show();
  }

  showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
  }

  hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
  }

  updateProgress(percent, text) {
    const progressBar = document.querySelector('#loadingProgress .progress-bar');
    const loadingText = document.querySelector('.loading-content p');
    
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (loadingText) loadingText.textContent = text;
  }

  //>>>>>>>>>>> NEW: Verify dynamic code from Firebase
async verifyDynamicCode(userEnteredCode) {
  if (!this.firebaseSync || !this.firebaseSync.isConnected) {
    console.warn('⚠️ Firebase not connected, allowing offline mode');
    return { valid: true }; // Allow if offline
  }

  try {
    const snapshot = await this.firebaseSync.firebaseDB
      .ref('mainSystem/dynamicCode').once('value');
    const data = snapshot.val();
    
    if (!data) {
      return { 
        valid: false, 
        reason: 'No active code found. Ask teacher to generate a new QR code.' 
      };
    }
    
    const now = Date.now();
    
    // Check if expired
    if (now > data.expiresAt) {
      return { 
        valid: false, 
        reason: 'Code expired. Get the new code from the teacher\'s screen.' 
      };
    }
    
    // Check if code matches
    if (data.code !== userEnteredCode) {
      return { 
        valid: false, 
        reason: 'Wrong code. Check the number on the teacher\'s screen.' 
      };
    }
    
    return { valid: true };
  } catch (error) {
    console.error('Error verifying code:', error);
    return { 
      valid: false, 
      reason: 'Connection error. Please try again.' 
    };
  }
}

//>>>>>>>>>>> Helper: Show code error message
showCodeError(message) {
  const msgDiv = document.getElementById('codeValidationMsg');
  msgDiv.className = 'alert alert-danger';
  msgDiv.textContent = message;
  msgDiv.style.display = 'block';
}

//>>>>>>>>>>> Helper: Show code success message
showCodeSuccess(message) {
  const msgDiv = document.getElementById('codeValidationMsg');
  msgDiv.className = 'alert alert-success';
  msgDiv.textContent = message;
  msgDiv.style.display = 'block';
}

//>>>>>>>>>>> NEW: Enable camera button after code verification
enableCameraButton() {
  const btn = document.getElementById('startCameraBtn');
  btn.disabled = false;
  btn.classList.remove('btn-secondary');
  btn.classList.add('btn-primary');
  btn.innerHTML = '<i class="bi bi-camera-video me-2"></i>Start Camera';
  
  // Hide security section
  document.getElementById('securityCodeSection').style.display = 'none';
}

//>>>>>>>>>>> NEW: Disable camera button (lock it)
disableCameraButton() {
  const btn = document.getElementById('startCameraBtn');
  btn.disabled = true;
  btn.classList.remove('btn-primary');
  btn.classList.add('btn-secondary');
  btn.innerHTML = '<i class="bi bi-lock me-2"></i>Locked - Verify Code First';
}
}

class FirebaseLiveSync {
  constructor() {
    this.firebaseDB = null;
    this.isConnected = false;
    this.listeners = [];
  }

  async init() {
    try {
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK not loaded');
      }
      
      this.firebaseDB = firebase.database();
      await this.firebaseDB.ref('.info/connected').once('value');
      
      this.isConnected = true;
      console.log('✅ Firebase Live Sync initialized');
      return true;
    } catch (error) {
      console.error('❌ Firebase Live Sync failed:', error);
      this.isConnected = false;
      return false;
    }
  }

 setupLiveListeners(callbacks) {
    if (!this.isConnected) return;

    // ✅ Get division path from mainSystemConfig
    const year = callbacks.year || new Date().getFullYear();
    const dept = callbacks.department;
    const course = callbacks.course;
    const academicYear = callbacks.academicYear;
    const division = callbacks.division;

    if (!dept || !course || !academicYear || !division) {
      console.warn('⚠️ Division not configured - cannot setup listeners');
      return;
    }

    const basePath = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}`;

    // Listen to selectedSubject
    const subjectRef = this.firebaseDB.ref(`${basePath}/selectedSubject`);
    subjectRef.on('value', (snapshot) => {
      const newSubject = snapshot.val();
      if (callbacks.onSubjectChange) {
        callbacks.onSubjectChange(newSubject, null);
      }
    });
    this.listeners.push(subjectRef);

    // Listen to selectedMonth
    const monthRef = this.firebaseDB.ref(`${basePath}/selectedMonth`);
    monthRef.on('value', (snapshot) => {
      const newMonth = snapshot.val();
      if (callbacks.onMonthChange) {
        callbacks.onMonthChange(newMonth, null);
      }
    });
    this.listeners.push(monthRef);

    // Listen to selectedYear
    const yearRef = this.firebaseDB.ref(`${basePath}/selectedYear`);
    yearRef.on('value', (snapshot) => {
      const newYear = snapshot.val();
      if (callbacks.onYearChange) {
        callbacks.onYearChange(newYear, null);
      }
    });
    this.listeners.push(yearRef);

    // Listen to currentDay
    const dayRef = this.firebaseDB.ref(`${basePath}/currentDay`);
    dayRef.on('value', (snapshot) => {
      const newDay = snapshot.val();
      if (callbacks.onDayChange) {
        callbacks.onDayChange(newDay, null);
      }
    });
    this.listeners.push(dayRef);
    
    console.log(`✅ Firebase live listeners active for: ${basePath}`);
  }

  async updateCurrentDate(date) {
    if (!this.isConnected) return;
    
    try {
      await this.firebaseDB.ref('mainSystem/currentDate').set(date);
      console.log(`✅ Updated Firebase currentDate: ${date}`);
    } catch (error) {
      console.error('Failed to update currentDate:', error);
    }
  }

  detachListeners() {
    this.listeners.forEach(ref => ref.off());
    this.listeners = [];
    console.log('✅ Firebase listeners detached');
  }

}


// Initialize system when page loads
let faceSystem;

window.addEventListener('DOMContentLoaded', async () => {
  window.faceSystem = new FaceRecognitionSystem(); // ✅ Make it global
  await window.faceSystem.init();
});

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// ✅ CLEANUP ON PAGE UNLOAD
window.addEventListener('beforeunload', () => {
  if (faceSystem) {
    // Clear intervals
    if (faceSystem.continuousReadInterval) {
      clearInterval(faceSystem.continuousReadInterval);
    }
    if (faceSystem.dateCheckInterval) {
      clearInterval(faceSystem.dateCheckInterval);
    }
    
    // Detach Firebase listeners
    if (faceSystem.firebaseSync) {
      faceSystem.firebaseSync.detachListeners();
    }
    
    // ✅✅✅ ADD THIS: Clear student session data
    if (faceSystem.userRole === 'student') {
      localStorage.removeItem('faceRecDivisionConfig');
      console.log('🧹 Cleared student session data');
    }
    
    console.log('✅ Cleaned up intervals and listeners');
  }
});