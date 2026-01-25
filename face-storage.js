/**
 * face-storage.js
 * Face Storage Module
 * Handles all face data storage and retrieval using IndexedDB
 */
 
class FaceStorage {
  constructor() {
    this.db = null;
    this.dbName = 'FaceRecognitionDB';
    this.dbVersion = 1;
    this.storeName = 'faces';
  }

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open database');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;

        // Create faces store if doesn't exist
      if (!this.db.objectStoreNames.contains('faces')) {
        this.db.createObjectStore('faces', { keyPath: 'id' });
      }
      
      // ✅ ADD THIS: Create settings store
      if (!this.db.objectStoreNames.contains('settings')) {
        this.db.createObjectStore('settings', { keyPath: 'key' });
        console.log('✅ Created settings store');
      }

      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('Face object store created');
        }
      };
    });
  }

  //>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// ✅ CHANGE 5: ADD DAY TRACKING METHODS TO face-storage.js
//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

/**
 * Get currently stored day number
 */
async getCurrentDay() {
  return new Promise((resolve) => {
    if (!this.db) {
      resolve(null);
      return;
    }

    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get('currentDay');

    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.value : null);
    };

    request.onerror = () => {
      console.error('Error getting current day:', request.error);
      resolve(null);
    };
  });
}

/**
 * Set current day number
 */
async setCurrentDay(day) {
  return new Promise((resolve, reject) => {
    if (!this.db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put({
      key: 'currentDay',
      value: day,
      timestamp: Date.now()
    });

    request.onsuccess = () => {
      console.log(`✅ Stored current day: ${day}`);
      resolve();
    };

    request.onerror = () => {
      console.error('Error setting current day:', request.error);
      reject(request.error);
    };
  });
}
//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

  /**
   * Save a face descriptor with student information
   */
  async saveFace(studentId, studentName, descriptor, imageData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const faceData = {
        id: studentId,
        name: studentName,
        descriptors: [Array.from(descriptor)], // Store as array of descriptors
        imageData: imageData,
        timestamp: Date.now(),
        attendanceToday: false,
        lastSeen: null
      };

      const request = store.put(faceData);

      request.onsuccess = () => {
        console.log(`Face saved for ${studentName} (${studentId})`);
        resolve(faceData);
      };

      request.onerror = () => {
        console.error('Failed to save face');
        reject(request.error);
      };
    });
  }

    /**
 * Add a new face descriptor to an existing student record
 */
async addFaceToExisting(studentId, studentName, newDescriptor, newImageData) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get existing face data
      const existingFace = await this.getFace(studentId);
      
      if (!existingFace) {
        // Student doesn't exist, save as new
        return this.saveFace(studentId, studentName, newDescriptor, newImageData);
      }
      
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // Add new descriptor to existing array
      const updatedDescriptors = [
        ...existingFace.descriptors.map(d => Array.from(d)),
        Array.from(newDescriptor)
      ];

      const faceData = {
        id: studentId,
        name: studentName, // Update name in case it changed
        descriptors: updatedDescriptors,
        imageData: newImageData, // Use latest image as preview
        timestamp: existingFace.timestamp, // Keep original registration time
        attendanceToday: existingFace.attendanceToday,
        lastSeen: existingFace.lastSeen
      };

      const request = store.put(faceData);

      request.onsuccess = () => {
        console.log(`✓ Added face to existing record: ${studentName} (${studentId}). Total faces: ${updatedDescriptors.length}`);
        resolve(faceData);
      };

      request.onerror = () => {
        console.error('Failed to add face to existing record');
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
}

    /**
 * Add multiple face descriptors to an existing student record (bulk)
 */
async addBulkFacesToExisting(studentId, studentName, newDescriptors, sampleFile) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get existing face data
      const existingFace = await this.getFace(studentId);
      
      if (!existingFace) {
        // Student doesn't exist, save as new
        return this.saveBulkFaces(studentId, studentName, newDescriptors, sampleFile);
      }

      const reader = new FileReader();
      
      reader.onload = (e) => {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        
        // Merge existing and new descriptors
        const allDescriptors = [
          ...existingFace.descriptors.map(d => Array.from(d)),
          ...newDescriptors.map(d => Array.from(d))
        ];
        
        const faceData = {
          id: studentId,
          name: studentName,
          descriptors: allDescriptors,
          imageData: e.target.result, // Use latest image
          timestamp: existingFace.timestamp,
          attendanceToday: existingFace.attendanceToday,
          lastSeen: existingFace.lastSeen
        };

        const request = store.put(faceData);

        request.onsuccess = () => {
          console.log(`✓ Added ${newDescriptors.length} faces to existing. Total: ${allDescriptors.length} for ${studentName} (${studentId})`);
          resolve(faceData);
        };

        request.onerror = () => {
          console.error('Failed to add bulk faces to existing');
          reject(request.error);
        };
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read image file'));
      };
      
      reader.readAsDataURL(sampleFile);
    } catch (error) {
      reject(error);
    }
  });
}
  /**
 * Save multiple face descriptors for one student (bulk import)
 */
async saveBulkFaces(studentId, studentName, descriptors, sampleFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const faceData = {
        id: studentId,
        name: studentName, // ✅ Now uses the parsed name!
        descriptors: descriptors.map(d => Array.from(d)), // Multiple descriptors
        imageData: e.target.result,
        timestamp: Date.now(),
        attendanceToday: false,
        lastSeen: null
      };

      const request = store.put(faceData);

      request.onsuccess = () => {
        console.log(`✓ Bulk saved ${descriptors.length} faces for ${studentName} (ID: ${studentId})`);
        resolve(faceData);
      };

      request.onerror = () => {
        console.error('Failed to save bulk faces');
        reject(request.error);
      };
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };
    
    reader.readAsDataURL(sampleFile);
  });
}

  /**
   * Get all registered faces
   */
  async getAllFaces() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        // Convert descriptor arrays back to Float32Array
        const faces = request.result.map(face => {
          // Handle both old (descriptor) and new (descriptors) format
          let descriptors;
          if (face.descriptors) {
            // New format: array of descriptors
            descriptors = face.descriptors.map(d => new Float32Array(d));
          } else if (face.descriptor) {
            // Old format: single descriptor (backward compatibility)
            descriptors = [new Float32Array(face.descriptor)];
          } else {
            descriptors = [];
          }
          
          return {
            ...face,
            descriptors: descriptors
          };
        });
        resolve(faces);
      };

      request.onerror = () => {
        console.error('Failed to get faces');
        reject(request.error);
      };
    });
  }

  /**
   * Get face by student ID
   */
  async getFace(studentId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(studentId);

      request.onsuccess = () => {
        if (request.result) {
          // Handle both old and new format
          let descriptors;
          if (request.result.descriptors) {
            descriptors = request.result.descriptors.map(d => new Float32Array(d));
          } else if (request.result.descriptor) {
            descriptors = [new Float32Array(request.result.descriptor)];
          } else {
            descriptors = [];
          }
          
          const face = {
            ...request.result,
            descriptors: descriptors
          };
          resolve(face);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Delete a face
   */
  async deleteFace(studentId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(studentId);

      request.onsuccess = () => {
        console.log(`Face deleted for ${studentId}`);
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Clear all faces
   */
  async clearAllFaces() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('All faces cleared');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Mark attendance for a student
   */
  async markAttendance(studentId) {
    const face = await this.getFace(studentId);
    if (!face) return false;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      face.attendanceToday = true;
      face.lastSeen = Date.now();

      const request = store.put(face);

      request.onsuccess = () => {
        console.log(`Attendance marked for ${face.name}`);
        resolve(true);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Clear today's attendance (reset all attendanceToday flags)
   */
  async clearTodayAttendance() {
    const faces = await this.getAllFaces();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      let completed = 0;
      const total = faces.length;

      if (total === 0) {
        resolve();
        return;
      }

      faces.forEach(face => {
        face.attendanceToday = false;
        const request = store.put(face);

        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            console.log('Today\'s attendance cleared');
            resolve();
          }
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    });
  }


    /**
   * Get last known day from storage
   */
  async getLastKnownDay() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SmartAttendanceDB', 1);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('appData')) {
          resolve(null);
          return;
        }
        
        const transaction = db.transaction(['appData'], 'readonly');
        const store = transaction.objectStore('appData');
        const getRequest = store.get('lastKnownDay');
        
        getRequest.onsuccess = () => {
          resolve(getRequest.result?.value || null);
        };
        
        getRequest.onerror = () => resolve(null);
      };
      
      request.onerror = () => resolve(null);
    });
  }

  /**
   * Save last known day to storage
   */
  async setLastKnownDay(day) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SmartAttendanceDB', 1);
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('appData')) {
          resolve();
          return;
        }
        
        const transaction = db.transaction(['appData'], 'readwrite');
        const store = transaction.objectStore('appData');
        const putRequest = store.put({ key: 'lastKnownDay', value: day });
        
        putRequest.onsuccess = () => {
          console.log(`✓ Saved last known day: ${day}`);
          resolve();
        };
        
        putRequest.onerror = () => resolve();
      };
      
      request.onerror = () => resolve();
    });
  }

  /**
   * Reset all attendance to "Not Present" (for day changes)
   */
  async resetAllAttendance() {
    const faces = await this.getAllFaces();
    
    return new Promise((resolve, reject) => {
      if (faces.length === 0) {
        resolve();
        return;
      }

      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      let completed = 0;
      const total = faces.length;

      faces.forEach(face => {
        face.attendanceToday = false;
        face.lastSeen = null;
        const request = store.put(face);

        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            console.log('✓ All attendance reset to "Not Present"');
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });
    });
  }

 
/**
 * Get last known calendar date
 */
async getLastKnownDate() {
  return new Promise((resolve) => {
    const transaction = this.db.transaction(['system'], 'readonly');
    const store = transaction.objectStore('system');
    const request = store.get('lastKnownDate');
    
    request.onsuccess = () => {
      resolve(request.result?.value || null);
    };
    
    request.onerror = () => resolve(null);
  });
}

/**
 * Save last known calendar date
 */
async setLastKnownDate(date) {
  return new Promise((resolve) => {
    const transaction = this.db.transaction(['system'], 'readwrite');
    const store = transaction.objectStore('system');
    store.put({ key: 'lastKnownDate', value: date });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
} 
  /**
   * Get attendance statistics
   */
  async getStats() {
    const faces = await this.getAllFaces();
    
    return {
      total: faces.length,
      presentToday: faces.filter(f => f.attendanceToday).length,
      absentToday: faces.filter(f => !f.attendanceToday).length
    };
  }

  /**
   * Export attendance data for main system
   */
  async exportAttendanceData() {
    const faces = await this.getAllFaces();
    
    return faces.map(face => ({
      id: face.id,
      name: face.name,
      status: face.attendanceToday ? 'Present' : 'Absent',
      timestamp: face.lastSeen
    }));
  }

  /**
   * Get labeled face descriptors for face-api.js
   */
  async getLabeledDescriptors() {
    const faces = await this.getAllFaces();
    
    return faces.map(face => ({
      label: `${face.id}|${face.name}`, // Combined label for easy splitting
      descriptors: face.descriptors // Already an array of Float32Array
    }));
  }
} // ← THIS WAS MISSING!

// Create global instance
const faceStorage = new FaceStorage();