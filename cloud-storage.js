/**
 * Cloud Storage Module - Firebase Implementation
 * Handles face data and attendance storage in Firebase Realtime Database
 * Compatible with existing face-storage.js interface for easy switching
 */

class CloudStorage {
  constructor() {
    this.db = null;
    this.facesRef = null;
    this.attendanceRef = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Firebase connection
   */
  async init() {
    try {
      // Check if Firebase is loaded
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK not loaded. Please include Firebase scripts in HTML.');
      }

      // Get database reference
      this.db = firebase.database();
      
      // Create references to database paths
      this.facesRef = this.db.ref('faces');
      this.attendanceRef = this.db.ref('attendance');
      
      // Test connection
      await this.db.ref('.info/connected').once('value');
      
      this.isInitialized = true;
      console.log('✅ Cloud storage initialized (Firebase Realtime Database)');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize cloud storage:', error);
      throw new Error('Cloud storage initialization failed: ' + error.message);
    }
  }

  /**
   * Save a face to Firebase
   * @param {string} studentId - Student ID
   * @param {string} studentName - Student name
   * @param {Float32Array} descriptor - Face descriptor
   * @param {string} imageData - Base64 image data
   */

/**
 * Get currently stored day number
 */
async getCurrentDay() {
  try {
    const snapshot = await this.db.ref('faceRecognition/currentDay').once('value');
    return snapshot.val();
  } catch (error) {
    console.error('Error getting current day:', error);
    return null;
  }
}

/**
 * Set current day number
 */
async setCurrentDay(day) {
  try {
    await this.db.ref('faceRecognition/currentDay').set(day);
    console.log(`✅ Stored current day in Firebase: ${day}`);
  } catch (error) {
    console.error('Error setting current day:', error);
  }
}


  async saveFace(studentId, studentName, descriptor, imageData) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const faceData = {
        id: studentId,
        name: studentName,
        descriptors: [Array.from(descriptor)], // Convert Float32Array to regular array
        imageData: imageData,
        timestamp: Date.now(),
        attendanceToday: false,
        lastSeen: null
      };

      // Save to Firebase
      await this.facesRef.child(studentId).set(faceData);
      
      console.log(`✅ Face saved to cloud: ${studentName} (${studentId})`);
      return faceData;
    } catch (error) {
      console.error('❌ Failed to save face to cloud:', error);
      throw error;
    }
  }

  /**
   * Add a new face descriptor to existing student record
   * @param {string} studentId - Student ID
   * @param {string} studentName - Student name
   * @param {Float32Array} newDescriptor - New face descriptor
   * @param {string} newImageData - New image data
   */
  async addFaceToExisting(studentId, studentName, newDescriptor, newImageData) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      // Get existing face data
      const snapshot = await this.facesRef.child(studentId).once('value');
      const existingFace = snapshot.val();

      if (!existingFace) {
        // Student doesn't exist, save as new
        return this.saveFace(studentId, studentName, newDescriptor, newImageData);
      }

      // Add new descriptor to existing array
      const updatedDescriptors = [
        ...existingFace.descriptors,
        Array.from(newDescriptor)
      ];

      const updatedData = {
        ...existingFace,
        name: studentName, // Update name if changed
        descriptors: updatedDescriptors,
        imageData: newImageData // Use latest image
      };

      await this.facesRef.child(studentId).set(updatedData);

      console.log(`✅ Added face to existing record: ${studentName} (${studentId}). Total faces: ${updatedDescriptors.length}`);
      return updatedData;
    } catch (error) {
      console.error('❌ Failed to add face to existing record:', error);
      throw error;
    }
  }

  /**
   * Save multiple face descriptors for one student (bulk import)
   * @param {string} studentId - Student ID
   * @param {string} studentName - Student name
   * @param {Array<Float32Array>} descriptors - Array of face descriptors
   * @param {File} sampleFile - Sample image file
   */
  async saveBulkFaces(studentId, studentName, descriptors, sampleFile) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      // Convert file to base64
      const imageData = await this._fileToBase64(sampleFile);

      const faceData = {
        id: studentId,
        name: studentName,
        descriptors: descriptors.map(d => Array.from(d)), // Convert all to arrays
        imageData: imageData,
        timestamp: Date.now(),
        attendanceToday: false,
        lastSeen: null
      };

      await this.facesRef.child(studentId).set(faceData);

      console.log(`✅ Bulk saved ${descriptors.length} faces for ${studentName} (${studentId})`);
      return faceData;
    } catch (error) {
      console.error('❌ Failed to bulk save faces:', error);
      throw error;
    }
  }

  /**
   * Add multiple face descriptors to existing student (bulk)
   * @param {string} studentId - Student ID
   * @param {string} studentName - Student name
   * @param {Array<Float32Array>} newDescriptors - New descriptors
   * @param {File} sampleFile - Sample image
   */

  async addBulkFacesToExisting(studentId, studentName, newDescriptors, sampleFile) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const snapshot = await this.facesRef.child(studentId).once('value');
      const existingFace = snapshot.val();

      if (!existingFace) {
        return this.saveBulkFaces(studentId, studentName, newDescriptors, sampleFile);
      }

      const imageData = await this._fileToBase64(sampleFile);

      const allDescriptors = [
        ...existingFace.descriptors,
        ...newDescriptors.map(d => Array.from(d))
      ];

      const updatedData = {
        ...existingFace,
        name: studentName,
        descriptors: allDescriptors,
        imageData: imageData
      };

      await this.facesRef.child(studentId).set(updatedData);

      console.log(`✅ Added ${newDescriptors.length} faces to existing. Total: ${allDescriptors.length} for ${studentName}`);
      return updatedData;
    } catch (error) {
      console.error('❌ Failed to add bulk faces:', error);
      throw error;
    }
  }

  /**
   * Get all registered faces from Firebase
   * @returns {Array} Array of face objects
   */
  async getAllFaces() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const snapshot = await this.facesRef.once('value');
      const facesData = snapshot.val();

      if (!facesData) {
        return [];
      }

      // Convert object to array and restore Float32Array descriptors
      const faces = Object.values(facesData).map(face => ({
        ...face,
        descriptors: face.descriptors.map(d => new Float32Array(d))
      }));

      console.log(`✅ Loaded ${faces.length} faces from cloud`);
      return faces;
    } catch (error) {
      console.error('❌ Failed to get faces from cloud:', error);
      throw error;
    }
  }

  /**
   * Get a single face by student ID
   * @param {string} studentId - Student ID
   * @returns {Object|null} Face object or null
   */
  async getFace(studentId) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const snapshot = await this.facesRef.child(studentId).once('value');
      const face = snapshot.val();

      if (!face) {
        return null;
      }

      // Restore Float32Array descriptors
      return {
        ...face,
        descriptors: face.descriptors.map(d => new Float32Array(d))
      };
    } catch (error) {
      console.error('❌ Failed to get face from cloud:', error);
      throw error;
    }
  }

  /**
   * Delete a face from Firebase
   * @param {string} studentId - Student ID
   */
  async deleteFace(studentId) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      await this.facesRef.child(studentId).remove();
      console.log(`✅ Face deleted from cloud: ${studentId}`);
    } catch (error) {
      console.error('❌ Failed to delete face from cloud:', error);
      throw error;
    }
  }

  /**
   * Clear all faces from Firebase
   */
  async clearAllFaces() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      await this.facesRef.remove();
      console.log('✅ All faces cleared from cloud');
    } catch (error) {
      console.error('❌ Failed to clear faces from cloud:', error);
      throw error;
    }
  }

  /**
   * Mark attendance for a student
   * @param {string} studentId - Student ID
   * @returns {boolean} Success status
   */
  async markAttendance(studentId) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const snapshot = await this.facesRef.child(studentId).once('value');
      const face = snapshot.val();

      if (!face) {
        return false;
      }

      // Update attendance flags
      await this.facesRef.child(studentId).update({
        attendanceToday: true,
        lastSeen: Date.now()
      });

      console.log(`✅ Attendance marked in cloud: ${face.name}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to mark attendance in cloud:', error);
      throw error;
    }
  }

  /**
   * Reset all attendance to "Not Present"
   */
  async resetAllAttendance() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const snapshot = await this.facesRef.once('value');
      const facesData = snapshot.val();

      if (!facesData) {
        return;
      }

      // Create batch update
      const updates = {};
      for (const studentId in facesData) {
        updates[`${studentId}/attendanceToday`] = false;
        updates[`${studentId}/lastSeen`] = null;
      }

      await this.facesRef.update(updates);

      console.log('✅ All attendance reset in cloud');
    } catch (error) {
      console.error('❌ Failed to reset attendance in cloud:', error);
      throw error;
    }
  }

  /**
   * Get last known day from main system database
   */
  async getLastKnownDay() {
    try {
      const snapshot = await this.db.ref('settings/lastKnownDay').once('value');
      return snapshot.val();
    } catch (error) {
      console.error('Error getting last known day:', error);
      return null;
    }
  }

  /**
   * Save last known day to database
   */
  async setLastKnownDay(day) {
    try {
      await this.db.ref('settings/lastKnownDay').set(day);
      console.log(`✅ Saved last known day: ${day}`);
    } catch (error) {
      console.error('Error saving last known day:', error);
    }
  }

  /**
   * Get attendance statistics
   * @returns {Object} Stats object with total, presentToday, absentToday
   */
  async getStats() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const snapshot = await this.facesRef.once('value');
      const facesData = snapshot.val();

      if (!facesData) {
        return { total: 0, presentToday: 0, absentToday: 0 };
      }

      const faces = Object.values(facesData);
      
      return {
        total: faces.length,
        presentToday: faces.filter(f => f.attendanceToday).length,
        absentToday: faces.filter(f => !f.attendanceToday).length
      };
    } catch (error) {
      console.error('❌ Failed to get stats from cloud:', error);
      throw error;
    }
  }

  /**
   * Export attendance data for main system sync
   * @returns {Array} Array of attendance records
   */
  async exportAttendanceData() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const snapshot = await this.facesRef.once('value');
      const facesData = snapshot.val();

      if (!facesData) {
        return [];
      }

      const faces = Object.values(facesData);

      return faces.map(face => ({
        id: face.id,
        name: face.name,
        status: face.attendanceToday ? 'Present' : 'Absent',
        timestamp: face.lastSeen
      }));
    } catch (error) {
      console.error('❌ Failed to export attendance data from cloud:', error);
      throw error;
    }
  }


  /**
 * Sync face-recognition attendance to main system database
 * Reads current subject/month/day from main system settings
 * Writes attendance in main system's expected format
 */
async syncToMainSystem() {
  if (!this.isInitialized) {
    throw new Error('Cloud storage not initialized');
  }

  try {
    // 1. Get main system settings
    const settingsSnapshot = await this.db.ref('mainSystem').once('value');
    const settings = settingsSnapshot.val();
    
    if (!settings || !settings.selectedSubject || settings.selectedMonth === null) {
      throw new Error('Main system not configured. Please select subject and month in main system first.');
    }
    
    const subject = settings.selectedSubject;
    const month = settings.selectedMonth;
    const year = settings.selectedYear;
    const day = settings.currentDay;
    
    // Create month key (format: "2025-01")
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    
    // 2. Get all faces with attendance status
    const facesSnapshot = await this.facesRef.once('value');
    const facesData = facesSnapshot.val();
    
    if (!facesData) {
      throw new Error('No students registered in face recognition system');
    }
    
    // 3. Prepare updates for main system
    const mainSystemPath = `mainSystem/attendanceData/${monthKey}/${subject}`;
    const updates = {};
    
    for (const studentId in facesData) {
      const face = facesData[studentId];
      
      // Set student name
      updates[`${studentId}/_name`] = face.name;
      
      // Set attendance for current day
      const status = face.attendanceToday ? 'Present' : 'Absent';
      updates[`${studentId}/${day}`] = status;
    }
    
    // 4. Write to main system's Firebase path
    await this.db.ref(mainSystemPath).update(updates);
    
    console.log(`✅ Synced to main system: ${subject} / ${monthKey} / Day ${day}`);
    console.log(`   Students synced: ${Object.keys(facesData).length}`);
    
    return {
      success: true,
      subject: subject,
      month: monthKey,
      day: day,
      studentsCount: Object.keys(facesData).length
    };
    
  } catch (error) {
    console.error('❌ Failed to sync to main system:', error);
    throw error;
  }
}

  /**
   * Get labeled face descriptors for face-api.js
   * @returns {Array} Array of labeled descriptor objects
   */
  async getLabeledDescriptors() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const faces = await this.getAllFaces();

      return faces.map(face => ({
        label: `${face.id}|${face.name}`,
        descriptors: face.descriptors // Already Float32Array from getAllFaces
      }));
    } catch (error) {
      console.error('❌ Failed to get labeled descriptors from cloud:', error);
      throw error;
    }
  }

  /**
   * Helper: Convert file to base64
   * @private
   */
  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target.result);
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  /**
   * Setup real-time listener for attendance changes
   * @param {Function} callback - Called when data changes
   */
  setupRealTimeSync(callback) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    this.facesRef.on('value', (snapshot) => {
      console.log('📡 Cloud data updated (real-time sync)');
      if (callback) {
        callback(snapshot.val());
      }
    });
  }

  /**
   * Remove real-time listener
   */
  removeRealTimeSync() {
    if (this.facesRef) {
      this.facesRef.off();
      console.log('📡 Real-time sync disabled');
    }
  }
}

// Create global instance
const cloudStorage = new CloudStorage();