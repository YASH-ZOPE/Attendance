/**
 * Cloud Storage Module - Firebase Implementation
 * Handles face data and attendance storage in Firebase Realtime Database
 * Compatible with existing face-storage.js interface for easy switching
 * ✅ NOW USES DIVISION-BASED PATHS
 */

class CloudStorage {
  constructor() {
    this.db = null;
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
      
      // ✅ REMOVED: this.facesRef (now using dynamic paths)
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
   * ✅ NEW: Get division-specific Firebase path for faces
   * @returns {string|null} Path like "faces/dept/course/year/division"
   */
  getDivisionPath() {
    const config = window.faceSystem?.mainSystemConfig || {};
    const dept = config.selectedDepartment;
    const course = config.selectedCourse;
    const academicYear = config.selectedAcademicYear;
    const division = config.selectedDivision;
    
    if (!dept || !course || !academicYear || !division) {
      console.warn('⚠️ Missing division context for face storage');
      return null;
    }
    
    return `faces/${dept}/${course}/${academicYear}/${division}`;
  }

  /**
   * ✅ NEW: Get Firebase reference for current division
   * @returns {firebase.database.Reference|null}
   */
  getFacesRef() {
    const path = this.getDivisionPath();
    if (!path) return null;
    return this.db.ref(path);
  }

  /**
   * Get currently stored day number
   */
  async getCurrentDay() {
    try {
      const snapshot = await this.db.ref('mainSystem/currentDay').once('value');
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
      await this.db.ref('mainSystem/currentDay').set(day);
      console.log(`✅ Stored current day in Firebase: ${day}`);
    } catch (error) {
      console.error('Error setting current day:', error);
    }
  }

  /**
   * Save a face to Firebase
   * ✅ UPDATED: Now uses division-specific path
   */
  async saveFace(studentId, studentName, descriptor, imageData) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      throw new Error('Please select Department, Course, Academic Year, and Division first');
    }

    try {
      const config = window.faceSystem?.mainSystemConfig || {};
      const faceData = {
        id: studentId,
        name: studentName,
        descriptors: [Array.from(descriptor)],
        imageData: imageData,
        timestamp: Date.now(),
        attendanceToday: false,
        lastSeen: null,
        department: config.selectedDepartment,
        course: config.selectedCourse,
        academicYear: config.selectedAcademicYear,
        division: config.selectedDivision
      };

      await facesRef.child(studentId).set(faceData);
      
      console.log(`✅ Face saved to cloud: ${this.getDivisionPath()}/${studentId}`);
      return faceData;
    } catch (error) {
      console.error('❌ Failed to save face to cloud:', error);
      throw error;
    }
  }

  /**
   * Add a new face descriptor to existing student record
   * ✅ UPDATED: Now uses division-specific path
   */
  async addFaceToExisting(studentId, studentName, newDescriptor, newImageData) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      throw new Error('Please select Department, Course, Academic Year, and Division first');
    }

    try {
      const snapshot = await facesRef.child(studentId).once('value');
      const existingFace = snapshot.val();

      if (!existingFace) {
        return this.saveFace(studentId, studentName, newDescriptor, newImageData);
      }

      const updatedDescriptors = [
        ...existingFace.descriptors,
        Array.from(newDescriptor)
      ];

      const updatedData = {
        ...existingFace,
        name: studentName,
        descriptors: updatedDescriptors,
        imageData: newImageData
      };

      await facesRef.child(studentId).set(updatedData);

      console.log(`✅ Added face to existing record: ${studentName} (${studentId}). Total faces: ${updatedDescriptors.length}`);
      return updatedData;
    } catch (error) {
      console.error('❌ Failed to add face to existing record:', error);
      throw error;
    }
  }

  /**
   * Save multiple face descriptors for one student (bulk import)
   * ✅ UPDATED: Now uses division-specific path
   */
  async saveBulkFaces(studentId, studentName, descriptors, sampleFile) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      throw new Error('Please select Department, Course, Academic Year, and Division first');
    }

    try {
      const imageData = await this._fileToBase64(sampleFile);
      const config = window.faceSystem?.mainSystemConfig || {};

      const faceData = {
        id: studentId,
        name: studentName,
        descriptors: descriptors.map(d => Array.from(d)),
        imageData: imageData,
        timestamp: Date.now(),
        attendanceToday: false,
        lastSeen: null,
        department: config.selectedDepartment,
        course: config.selectedCourse,
        academicYear: config.selectedAcademicYear,
        division: config.selectedDivision
      };

      await facesRef.child(studentId).set(faceData);

      console.log(`✅ Bulk saved ${descriptors.length} faces for ${studentName} at ${this.getDivisionPath()}/${studentId}`);
      return faceData;
    } catch (error) {
      console.error('❌ Failed to bulk save faces:', error);
      throw error;
    }
  }

  /**
   * Add multiple face descriptors to existing student (bulk)
   * ✅ UPDATED: Now uses division-specific path
   */
  async addBulkFacesToExisting(studentId, studentName, newDescriptors, sampleFile) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      throw new Error('Please select Department, Course, Academic Year, and Division first');
    }

    try {
      const snapshot = await facesRef.child(studentId).once('value');
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

      await facesRef.child(studentId).set(updatedData);

      console.log(`✅ Added ${newDescriptors.length} faces to existing. Total: ${allDescriptors.length} for ${studentName}`);
      return updatedData;
    } catch (error) {
      console.error('❌ Failed to add bulk faces:', error);
      throw error;
    }
  }

  /**
   * Get all registered faces from Firebase
   * ✅ UPDATED: Now uses division-specific path
   */
  async getAllFaces() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      console.warn('⚠️ No division selected, returning empty faces list');
      return [];
    }

    try {
      const snapshot = await facesRef.once('value');
      const facesData = snapshot.val();

      if (!facesData) {
        return [];
      }

      const faces = Object.values(facesData).map(face => ({
        ...face,
        descriptors: face.descriptors.map(d => new Float32Array(d))
      }));

      console.log(`✅ Loaded ${faces.length} faces from ${this.getDivisionPath()}`);
      return faces;
    } catch (error) {
      console.error('❌ Failed to get faces from cloud:', error);
      throw error;
    }
  }

  /**
   * Get a single face by student ID
   * ✅ UPDATED: Now uses division-specific path
   */
  async getFace(studentId) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      return null;
    }

    try {
      const snapshot = await facesRef.child(studentId).once('value');
      const face = snapshot.val();

      if (!face) {
        return null;
      }

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
   * ✅ UPDATED: Now uses division-specific path
   */
  async deleteFace(studentId) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      throw new Error('Please select Department, Course, Academic Year, and Division first');
    }

    try {
      await facesRef.child(studentId).remove();
      console.log(`✅ Face deleted from cloud: ${studentId}`);
    } catch (error) {
      console.error('❌ Failed to delete face from cloud:', error);
      throw error;
    }
  }

  /**
   * Clear all faces from Firebase
   * ✅ UPDATED: Now uses division-specific path (only clears current division)
   */
  async clearAllFaces() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      throw new Error('Please select Department, Course, Academic Year, and Division first');
    }

    try {
      await facesRef.remove();
      console.log(`✅ All faces cleared from ${this.getDivisionPath()}`);
    } catch (error) {
      console.error('❌ Failed to clear faces from cloud:', error);
      throw error;
    }
  }

  /**
   * Mark attendance for a student
   * ✅ UPDATED: Now uses division-specific path
   */
  async markAttendance(studentId) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      return false;
    }

    try {
      const snapshot = await facesRef.child(studentId).once('value');
      const face = snapshot.val();

      if (!face) {
        return false;
      }

      await facesRef.child(studentId).update({
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
   * ✅ UPDATED: Now uses division-specific path
   */
  async resetAllAttendance() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      return;
    }

    try {
      const snapshot = await facesRef.once('value');
      const facesData = snapshot.val();

      if (!facesData) {
        return;
      }

      const updates = {};
      for (const studentId in facesData) {
        updates[`${studentId}/attendanceToday`] = false;
        updates[`${studentId}/lastSeen`] = null;
      }

      await facesRef.update(updates);

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
   * ✅ UPDATED: Now uses division-specific path
   */
  async getStats() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      return { total: 0, presentToday: 0, absentToday: 0 };
    }

    try {
      const snapshot = await facesRef.once('value');
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
   * ✅ UPDATED: Now uses division-specific path
   */
  async exportAttendanceData() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      return [];
    }

    try {
      const snapshot = await facesRef.once('value');
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
   * ✅ UPDATED: Now uses division-specific path
   */
  async syncToMainSystem() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      throw new Error('Please select Department, Course, Academic Year, and Division first');
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
      
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      // 2. Get all faces from current division
      const facesSnapshot = await facesRef.once('value');
      const facesData = facesSnapshot.val();
      
      if (!facesData) {
        throw new Error('No students registered in face recognition system for this division');
      }
      
      // 3. Prepare updates for main system
      const mainSystemPath = `mainSystem/attendanceData/${monthKey}/${subject}`;
      const updates = {};
      
      for (const studentId in facesData) {
        const face = facesData[studentId];
        
        updates[`${studentId}/_name`] = face.name;
        
        const status = face.attendanceToday ? 'Present' : 'Absent';
        updates[`${studentId}/${day}`] = status;
      }
      
      // 4. Write to main system's Firebase path
      await this.db.ref(mainSystemPath).update(updates);
      
      console.log(`✅ Synced to main system: ${subject} / ${monthKey} / Day ${day}`);
      console.log(`   Students synced: ${Object.keys(facesData).length}`);
      console.log(`   From division: ${this.getDivisionPath()}`);
      
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
   * ✅ UPDATED: Now uses division-specific path
   */
  async getLabeledDescriptors() {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    try {
      const faces = await this.getAllFaces();

      return faces.map(face => ({
        label: `${face.id}|${face.name}`,
        descriptors: face.descriptors
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
   * ✅ UPDATED: Now uses division-specific path
   */
  setupRealTimeSync(callback) {
    if (!this.isInitialized) {
      throw new Error('Cloud storage not initialized');
    }

    const facesRef = this.getFacesRef();
    if (!facesRef) {
      console.warn('⚠️ Cannot setup real-time sync: no division selected');
      return;
    }

    facesRef.on('value', (snapshot) => {
      console.log('📡 Cloud data updated (real-time sync)');
      if (callback) {
        callback(snapshot.val());
      }
    });
  }

  /**
   * Remove real-time listener
   * ✅ UPDATED: Now uses division-specific path
   */
  removeRealTimeSync() {
    const facesRef = this.getFacesRef();
    if (facesRef) {
      facesRef.off();
      console.log('📡 Real-time sync disabled');
    }
  }
}

// Create global instance
const cloudStorage = new CloudStorage();