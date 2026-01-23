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
    
    // Main system database reference
    this.mainDB = null;
  }

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
    
    console.log(`Logged in as: ${user.attributes.email} (${role})`);
    
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

      // Show loading overlay
      this.showLoading();
      
      // Initialize storage
      await faceStorage.init();
      
      // Connect to main system database
      await this.connectToMainSystem();
      
      // Load face-api.js models
      await this.loadModels();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Check for day changes
      await this.checkForDayChange();

      // Load and display registered students
      await this.updateStudentList();
      await this.updateStats();
      
      // Hide loading overlay
      this.hideLoading();
      
      this.showToast('System ready! You can start using face recognition.', 'success');
    } catch (error) {
      console.error('Initialization error:', error);
      this.showToast('Failed to initialize system: ' + error.message, 'danger');
      this.hideLoading();
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
   * Check if day has changed and reset attendance if needed
   */
  /**
 * Enhanced day change detection - checks BOTH calendar date AND main system day
 */
async checkForDayChange() {
  try {
    // ✅ CHECK 1: Real Calendar Date
    const today = new Date().toDateString(); // "Fri Jan 24 2025"
    const lastKnownDate = await firebase.database()
      .ref('systemConfig/currentDate').once('value').then(snap => snap.val());
    
    // Check if date changed
    if (lastKnownDate && today !== lastKnownDate) {
      console.log(`📅 CALENDAR DATE CHANGED! ${lastKnownDate} → ${today}`);
      
      // Reset attendance because it's a new day
      await this.handleDayChange('calendar-auto-reset');
      
      // ✅ SAVE to Firebase (not faceStorage!)
      await firebase.database()
        .ref('systemConfig/currentDate').set(today);
      
      this.showToast(
        `🌅 New day detected! All attendance reset automatically.`,
        'info'
      );
    }
    
    // ✅ Initialize in Firebase if first time
    if (!lastKnownDate) {
      await firebase.database()
        .ref('systemConfig/currentDate').set(today);
      console.log(`📅 Date initialized in Firebase: ${today}`);
    }
    
    // ✅ CHECK 2: Main System Day Number (for manual control)
    const currentDay = await this.getFromMainDB('currentDay');
    
    if (!currentDay) {
      console.warn('⚠️ Main system not initialized - using calendar-only mode');
      return; 
    }
    
    const lastKnownDay = await faceStorage.getLastKnownDay();
    
    if (lastKnownDay === null) {
      await faceStorage.setLastKnownDay(currentDay);
      console.log(`📅 Day counter initialized: Day ${currentDay}`);
      return;
    }
    
    // Check if day counter changed in main system
    if (currentDay !== lastKnownDay) {
      console.log(`📅 DAY COUNTER CHANGED! ${lastKnownDay} → ${currentDay}`);
      await this.handleDayChange(currentDay);
      await faceStorage.setLastKnownDay(currentDay);
    }
    
  } catch (error) {
    console.error('Error checking day change:', error);
  }
}

/**
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
    
    // Notify user
    if (newDay === 'calendar-auto-reset') {
      this.showToast(
        `📅 New calendar day! All attendance reset to "Not Present".`,
        'info'
      );
    } else {
      this.showToast(
        `📅 Day changed to Day ${newDay}. All attendance reset to "Not Present".`,
        'info'
      );
    }
    
    console.log(`✅ Attendance reset complete`);
    
  } catch (error) {
    console.error('Error handling day change:', error);
    this.showToast('Failed to reset attendance for new day', 'danger');
  }
}

  /**
   * Handle day change - reset all attendance
   */
  async handleDayChange(newDay) {
    try {
      console.log(`🔄 Resetting attendance for Day ${newDay}...`);
      
      // Clear in-memory tracking
      this.recognizedToday.clear();
      this.lastAttendanceTime = {};
      
      // Reset all attendance in database
      await this.storage.resetAllAttendance();
      
      // Save new day
      await faceStorage.setLastKnownDay(newDay);
      
      // Update UI
      await this.updateStudentList();
      await this.updateStats();
      
      // Notify user
      this.showToast(
        `📅 Day changed to Day ${newDay}. All attendance reset to "Not Present".`,
        'info'
      );
      
      console.log(`✅ Attendance reset complete for Day ${newDay}`);
      
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

  /**
   * Start camera
   */
  async startCamera() {
    if (!this.isModelLoaded) {
      this.showToast('Please wait for models to load', 'warning');
      return;
    }

    try {
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
      return; // Still in cooldown
    }

    // Mark attendance
    const success = await this.storage.markAttendance(studentId);
    
    if (success) {
      this.lastAttendanceTime[studentId] = now;
      
      if (!this.recognizedToday.has(studentId)) {
        this.recognizedToday.add(studentId);
        this.showToast(`✓ Attendance marked for ${studentName}`, 'success');
        await this.updateStudentList();

         // ✅ NEW: Auto-sync to main system immediately
      try {
        const result = await this.storage.syncToMainSystem();
        console.log(`✅ Auto-synced ${studentName} to main system`);
      } catch (error) {
        console.warn('Auto-sync failed:', error);
        // Don't show error to user - silent failure
      }
      
      await this.updateStudentList();
      }
    }
  }

  /**
   * Load face matcher from storage
   */
  async loadFaceMatcher() {
    const labeledDescriptors = await this.storage.getLabeledDescriptors();
    
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
    
  try {
    // ✅ Check if student already exists
    const existingFace = await faceStorage.getFace(studentId);
    
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
      const action = await this.showFaceExistsDialog(existingFace);
      
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
  }

  /**
   * Update statistics
   */
  async updateStats() {
    const stats = await this.storage.getStats();
    document.getElementById('statRegistered').textContent = stats.total;
    document.getElementById('statRecognized').textContent = stats.presentToday;
    document.getElementById('statUnknown').textContent = this.unknownCount;
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

  // ✅ Check for existing students
  const studentIds = Object.keys(this.selectedFiles);
  const conflicts = [];
  
  for (const studentId of studentIds) {
    const existing = await faceStorage.getFace(studentId);
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
    failed: []
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
      const existing = await faceStorage.getFace(studentId);
      
      // Handle based on user's bulk action choice
      if (existing && bulkAction === 'skip') {
        // Skip this student
        results.failed.push({
          id: studentId,
          error: 'Skipped (already exists)'
        });
        continue; // Skip to next student
      }

      // Process all images for this student
      const descriptors = await this.processStudentImages(studentId, files);
      
      if (descriptors.length === 0) {
        throw new Error('No faces detected in any image');
      }

      // Save based on action
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
        action: existing ? (bulkAction === 'add' ? 'Added to existing' : 'Replaced') : 'New'
      });
      
    } catch (error) {
      console.error(`Failed to process ${studentId}:`, error);
      results.failed.push({
        id: studentId,
        error: error.message
      });
    }
  }

  // Reload face matcher
  await this.loadFaceMatcher();
  
  // Update UI
  await this.updateStudentList();
  await this.updateStats();
  
  // Hide progress modal
  document.getElementById('importProgressModal').style.display = 'none';
  
  // Show results
  this.showImportResults(results);
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
        <div class="col-md-4">
          <div class="text-center">
            <h2 class="text-primary">${results.total}</h2>
            <small>Total Students</small>
          </div>
        </div>
        <div class="col-md-4">
          <div class="text-center">
            <h2 class="text-success">${results.success.length}</h2>
            <small>Successfully Imported</small>
          </div>
        </div>
        <div class="col-md-4">
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
    const selectedSubject = await this.getFromMainDB('selectedSubject');
    const selectedMonth = await this.getFromMainDB('selectedMonth');
    const selectedYear = await this.getFromMainDB('selectedYear');
    const currentDay = await this.getFromMainDB('currentDay');
    const subjects = await this.getFromMainDB('subjects');
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

    // Load main system state
    const selectedSubject = await this.getFromMainDB('selectedSubject');
    const selectedMonth = await this.getFromMainDB('selectedMonth');
    const selectedYear = await this.getFromMainDB('selectedYear');
    const currentDay = await this.getFromMainDB('currentDay') || 1;
    
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
    let allAttendanceData = await this.getFromMainDB('attendanceData') || {};

    // ⚠️ FIX: Match main system's month key format (no +1)
    // Main system uses 0-11 directly: "2026-00" for January
    const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    
    console.log('Month Key:', monthKey); // Should show "2026-00" for January

    // Initialize structure
    if (!allAttendanceData[monthKey]) {
      allAttendanceData[monthKey] = {};
    }
    if (!allAttendanceData[monthKey][selectedSubject]) {
      allAttendanceData[monthKey][selectedSubject] = {};
    }

    // Update attendance
    let syncedCount = 0;
    attendanceData.forEach(student => {
      // Initialize student if doesn't exist
      if (!allAttendanceData[monthKey][selectedSubject][student.id]) {
        allAttendanceData[monthKey][selectedSubject][student.id] = {
          _name: student.name
        };
      }
      
      // Mark attendance for current day
      allAttendanceData[monthKey][selectedSubject][student.id][currentDay] = student.status;
      syncedCount++;
      
      console.log(`Synced: ${student.id} - ${student.name} - ${student.status} for Day ${currentDay}`);
    });

    // Save back to main system
    await this.saveToMainDB('attendanceData', allAttendanceData);

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
}

// Initialize system when page loads
let faceSystem;

window.addEventListener('DOMContentLoaded', async () => {
  faceSystem = new FaceRecognitionSystem();
  await faceSystem.init();
});