    // ==================== GLOBAL VARIABLES ====================
    let firebaseDB = null;
    let useCloud = false;
    let db = null;
    let dbReady = false;
    let leaveModal = null;

    // Application State
    const appState = {
      selectedDepartment: null,
      selectedCourse: null,
      selectedAcademicYear: null,
      selectedDivision: null,
      selectedMonth: null,
      selectedYear: null,
      selectedSubject: null
    };

    // Leave State
    const leaveState = {
      applications: [],
      filters: {
        status: 'all',
        month: 'current'
      }
    };

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    // ==================== FIREBASE INITIALIZATION ====================
    async function initFirebase() {
      try {
        if (typeof firebase === 'undefined') {
          console.warn('⚠️ Firebase not loaded, using IndexedDB only');
          return false;
        }

        firebaseDB = firebase.database();
        await firebaseDB.ref('.info/connected').once('value');

        useCloud = true;
        console.log('✅ Firebase connected');
        return true;
      } catch (error) {
        console.error('❌ Firebase connection failed:', error);
        useCloud = false;
        return false;
      }
    }

    // ==================== INDEXEDDB FUNCTIONS ====================
    function openDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("SmartAttendanceDB", 1);

        request.onupgradeneeded = (event) => {
          db = event.target.result;
          if (!db.objectStoreNames.contains("appData")) {
            db.createObjectStore("appData", { keyPath: "key" });
          }
        };

        request.onsuccess = (event) => {
          db = event.target.result;
          dbReady = true;
          console.log("✅ IndexedDB opened");
          resolve(db);
        };

        request.onerror = (event) => {
          console.error("❌ IndexedDB error:", event.target.error);
          reject(event.target.error);
        };
      });
    }

    function saveToDatabase(key, data) {
      return new Promise((resolve, reject) => {
        if (!dbReady) {
          console.warn("Database not ready");
          resolve();
          return;
        }

        try {
          const transaction = db.transaction(["appData"], "readwrite");
          const store = transaction.objectStore("appData");
          store.put({ key: key, value: data });

          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        } catch (error) {
          reject(error);
        }
      });
    }

    function loadFromDatabase(key) {
      return new Promise((resolve, reject) => {
        if (!dbReady) {
          resolve(null);
          return;
        }

        try {
          const transaction = db.transaction(["appData"], "readonly");
          const store = transaction.objectStore("appData");
          const request = store.get(key);

          request.onsuccess = () => {
            resolve(request.result ? request.result.value : null);
          };
          request.onerror = () => reject(request.error);
        } catch (error) {
          reject(error);
        }
      });
    }

    // ==================== UTILITY FUNCTIONS ====================
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function showAlert(message, type = 'info') {
      alert(message);
    }

    function formatDateForInput(date) {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function getDaysBetweenDates(fromDate, toDate) {
      const days = [];
      const start = new Date(fromDate);
      const end = new Date(toDate);

      if (start > end) return [];

      const current = new Date(start);
      while (current <= end) {
        days.push(current.getDate());
        current.setDate(current.getDate() + 1);
      }

      return days;
    }

    function getLeaveApplicationsPath() {
      const year = appState.selectedYear;
      const dept = appState.selectedDepartment;
      const course = appState.selectedCourse;
      const academicYear = appState.selectedAcademicYear;
      const division = appState.selectedDivision;

      if (!year || !dept || !course || !academicYear || !division) {
        return null;
      }

      return `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}/leaveApplications`;
    }

    function validateDivisionContext() {
      const missing = [];

      if (!appState.selectedDepartment) missing.push('Department');
      if (!appState.selectedCourse) missing.push('Course');
      if (!appState.selectedAcademicYear) missing.push('Academic Year');
      if (!appState.selectedDivision) missing.push('Division');
      if (appState.selectedMonth === null) missing.push('Month');
      if (appState.selectedYear === null) missing.push('Year');

      return {
        valid: missing.length === 0,
        missing: missing
      };
    }

    // ==================== CONTEXT LOADING ====================
    async function loadContext() {
  try {

    if (useCloud && firebaseDB) {
      const currentFirebaseUser = firebase.auth().currentUser;
      if (currentFirebaseUser) {
        const uid = currentFirebaseUser.uid;
        const snapshot = await firebaseDB.ref(`mainSystem/userPreferences/${uid}/lastSelection`).once('value');
        const prefs = snapshot.val() || {};

        if (prefs.department) appState.selectedDepartment = prefs.department;
        if (prefs.course) appState.selectedCourse = prefs.course;
        if (prefs.academicYear) appState.selectedAcademicYear = prefs.academicYear;
        if (prefs.division) appState.selectedDivision = prefs.division;
        if (prefs.subject) appState.selectedSubject = prefs.subject;
        if (prefs.month !== undefined && prefs.month !== null) appState.selectedMonth = prefs.month;
        if (prefs.year !== undefined && prefs.year !== null) appState.selectedYear = prefs.year;
      }
    }

    // Load from IndexedDB
    const dept = await loadFromDatabase('selectedDepartment');
    const course = await loadFromDatabase('selectedCourse');
    const acYear = await loadFromDatabase('selectedAcademicYear');
    const division = await loadFromDatabase('selectedDivision');
    const month = await loadFromDatabase('selectedMonth');
    const year = await loadFromDatabase('selectedYear');
    const subject = await loadFromDatabase('selectedSubject');

    if (dept) appState.selectedDepartment = dept;
    if (course) appState.selectedCourse = course;
    if (acYear) appState.selectedAcademicYear = acYear;
    if (division) appState.selectedDivision = division;
    if (month !== null) appState.selectedMonth = month;
    if (year !== null) appState.selectedYear = year;
    if (subject) appState.selectedSubject = subject;

    updateContextDisplay();

    console.log('✅ Context loaded:', appState);
  } catch (error) {
    console.error('Error loading context:', error);
  }
}

    function updateContextDisplay() {
      document.getElementById('contextDept').textContent = `Department: ${appState.selectedDepartment || '--'}`;
      document.getElementById('contextCourse').textContent = `Course: ${appState.selectedCourse || '--'}`;
      document.getElementById('contextAcYear').textContent = `Academic Year: ${appState.selectedAcademicYear || '--'}`;
      document.getElementById('contextDivision').textContent = `Division: ${appState.selectedDivision || '--'}`;

      if (appState.selectedMonth !== null && appState.selectedYear !== null) {
        document.getElementById('contextMonth').textContent = `Month: ${monthNames[appState.selectedMonth]} ${appState.selectedYear}`;
      } else {
        document.getElementById('contextMonth').textContent = 'Month: --';
      }
    }

    // ==================== STUDENT LOADING ====================
    async function loadStudentsForLeaveForm() {
      const studentSelect = document.getElementById('leaveStudentSelect');
      studentSelect.innerHTML = '<option value="">-- Select Student --</option>';

      const year = appState.selectedYear;
      const dept = appState.selectedDepartment;
      const course = appState.selectedCourse;
      const academicYear = appState.selectedAcademicYear;
      const division = appState.selectedDivision;

      if (!year || !dept || !course || !academicYear || !division) {
        studentSelect.innerHTML += '<option value="" disabled>Please select all required fields first</option>';
        return;
      }

      // Load master student list
      const studentsPath = `mainSystem/attendanceData/${year}/${dept}/${course}/${academicYear}/${division}/students`;

      try {
        let students = {};

        if (useCloud && firebaseDB) {
          const snapshot = await firebaseDB.ref(studentsPath).once('value');
          students = snapshot.val() || {};
        }

        if (Object.keys(students).length === 0) {
          console.warn('⚠️ No students found');
          studentSelect.innerHTML += '<option value="" disabled>No students found</option>';
          return;
        }

        // Convert to array and sort
        const studentArray = [];
        for (const studentId in students) {
          studentArray.push({
            id: studentId,
            name: students[studentId].name || studentId
          });
        }

        studentArray.sort((a, b) => {
          const aNum = parseInt(a.id);
          const bNum = parseInt(b.id);
          if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
          return a.name.localeCompare(b.name);
        });

        // Populate dropdown
        studentArray.forEach(student => {
          const option = document.createElement('option');
          option.value = student.id;
          option.textContent = `${student.id} - ${student.name}`;
          studentSelect.appendChild(option);
        });

        console.log(`✅ Loaded ${studentArray.length} students`);

      } catch (error) {
        console.error('Error loading students:', error);
        studentSelect.innerHTML += '<option value="" disabled>Error loading students</option>';
      }
    }

    // ==================== LEAVE DAY COUNT ====================
    function updateLeaveDayCount() {
      const fromDate = document.getElementById('leaveFromDate').value;
      const toDate = document.getElementById('leaveToDate').value;
      const dayCountAlert = document.getElementById('leaveDayCountAlert');
      const totalLeaveDaysSpan = document.getElementById('totalLeaveDays');
      const leaveDaysListDiv = document.getElementById('leaveDaysList');

      if (!fromDate || !toDate) {
        dayCountAlert.style.display = 'none';
        return;
      }

      const days = getDaysBetweenDates(fromDate, toDate);

      if (days.length === 0) {
        dayCountAlert.style.display = 'none';
        return;
      }

      totalLeaveDaysSpan.textContent = days.length;
      leaveDaysListDiv.textContent = `Days: ${days.join(', ')}`;
      dayCountAlert.style.display = 'block';
    }

    // ==================== SUBMIT LEAVE ====================
    async function submitLeaveApplication() {
  const studentId = document.getElementById('leaveStudentSelect').value;
  const fromDate = document.getElementById('leaveFromDate').value;
  const toDate = document.getElementById('leaveToDate').value;
  const reason = document.getElementById('leaveReason').value.trim();

  const validationAlert = document.getElementById('leaveValidationAlert');
  const validationMsg = document.getElementById('leaveValidationMsg');
  const role = await getUserRole();
  const attributes = await getUserAttributes();

  if (role === 'student') {
    const authenticatedStudentId = attributes['custom:studentId'];
    if (studentId !== authenticatedStudentId) {
      validationMsg.textContent = '⚠️ Security Error: You can only submit leave for yourself!';
      validationAlert.style.display = 'block';
      return;
    }
  }

  const contextValidation = validateDivisionContext();
  if (!contextValidation.valid) {
    validationMsg.textContent = `Please select: ${contextValidation.missing.join(', ')}`;
    validationAlert.style.display = 'block';
    return;
  }

  if (!studentId) {
    validationMsg.textContent = 'Please select a student';
    validationAlert.style.display = 'block';
    return;
  }

  if (!fromDate || !toDate) {
    validationMsg.textContent = 'Please select both From and To dates';
    validationAlert.style.display = 'block';
    return;
  }

  if (new Date(fromDate) > new Date(toDate)) {
    validationMsg.textContent = 'From date cannot be after To date';
    validationAlert.style.display = 'block';
    return;
  }

  if (!reason) {
    validationMsg.textContent = 'Please provide a reason for leave';
    validationAlert.style.display = 'block';
    return;
  }

  const days = getDaysBetweenDates(fromDate, toDate);

  if (days.length === 0) {
    validationMsg.textContent = 'Invalid date range';
    validationAlert.style.display = 'block';
    return;
  }

  const studentSelect = document.getElementById('leaveStudentSelect');
  const studentName = studentSelect.options[studentSelect.selectedIndex].text.split(' - ')[1] || studentId;

  try {
    // Get Cognito token
    const session = await getSession();
    const cognitoToken = session.getIdToken().getJwtToken();

    const response = await fetch('https://attendance-backend-p7uk.onrender.com/api/leave/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cognitoToken}`
      },
      body: JSON.stringify({
        studentId,
        studentName,
        fromDate,
        toDate,
        days,
        reason,
        month: new Date(fromDate).getMonth(),
        year: new Date(fromDate).getFullYear()
      })
    });

    const result = await response.json();

    if (!response.ok) {
      showAlert(result.error || 'Failed to submit leave', 'danger');
      return;
    }

    if (leaveModal) leaveModal.hide();
    resetLeaveForm();
    await loadLeaveApplications();
    showAlert(`Leave submitted for ${studentName} (${days.length} days)`, 'success');

  } catch (error) {
    console.error('Error submitting leave:', error);
    showAlert('Failed to submit leave. Please try again.', 'danger');
  }
}

    // ==================== RESET FORM ====================
    function resetLeaveForm() {
      document.getElementById('leaveStudentSelect').value = '';
      document.getElementById('leaveFromDate').value = '';
      document.getElementById('leaveToDate').value = '';
      document.getElementById('leaveReason').value = '';
      document.getElementById('leaveDayCountAlert').style.display = 'none';
      document.getElementById('leaveValidationAlert').style.display = 'none';
    }

    // ==================== LOAD LEAVE APPLICATIONS ====================
    async function loadLeaveApplications() {
      const leavePath = getLeaveApplicationsPath();

      if (!leavePath) {
        console.warn('Cannot load leaves: division context incomplete');
        leaveState.applications = [];
        renderLeaveTable();
        updateStats();
        return;
      }

      try {
        let leaves = {};

        if (useCloud && firebaseDB) {
          const snapshot = await firebaseDB.ref(leavePath).once('value');
          leaves = snapshot.val() || {};
        } else {
          leaves = await loadFromDatabase('leaveApplications') || {};
        }

        leaveState.applications = Object.keys(leaves).map(id => ({
          id: id,
          ...leaves[id]
        }));

        leaveState.applications.sort((a, b) => b.submittedAt - a.submittedAt);

        console.log(`✅ Loaded ${leaveState.applications.length} leave applications`);

        renderLeaveTable();
        updateStats();

      } catch (error) {
        console.error('Error loading leave applications:', error);
        leaveState.applications = [];
        renderLeaveTable();
        updateStats();
      }
    }

    // ==================== RENDER LEAVE TABLE ====================
    function renderLeaveTable() {
      const tbody = document.getElementById('leaveTableBody');

      if (leaveState.applications.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="empty-state">
              <i class="bi bi-inbox"></i>
              <p class="mt-2 mb-0">No leave applications yet</p>
              <small>Click "Submit New Leave" to add one</small>
            </td>
          </tr>
        `;
        return;
      }

      // Apply filters
      let filteredLeaves = [...leaveState.applications];

      if (leaveState.filters.status !== 'all') {
        filteredLeaves = filteredLeaves.filter(leave => leave.status === leaveState.filters.status);
      }

      if (leaveState.filters.month === 'current') {
        filteredLeaves = filteredLeaves.filter(leave =>
          leave.month === appState.selectedMonth && leave.year === appState.selectedYear
        );
      }

      tbody.innerHTML = '';

      if (filteredLeaves.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="empty-state">
              <i class="bi bi-funnel"></i>
              <p class="mt-2 mb-0">No applications match the selected filters</p>
            </td>
          </tr>
        `;
        return;
      }

      filteredLeaves.forEach(leave => {
        const row = document.createElement('tr');

        if (leave.status === 'pending') row.classList.add('leave-row-pending');
        else if (leave.status === 'approved') row.classList.add('leave-row-approved');
        else if (leave.status === 'rejected') row.classList.add('leave-row-rejected');

        const fromDateObj = new Date(leave.fromDate);
        const toDateObj = new Date(leave.toDate);
        const fromFormatted = `${fromDateObj.getDate()} ${monthNames[fromDateObj.getMonth()]}`;
        const toFormatted = `${toDateObj.getDate()} ${monthNames[toDateObj.getMonth()]}`;

        let statusBadge = '';
        if (leave.status === 'pending') {
          statusBadge = '<span class="leave-status-pending">Pending</span>';
        } else if (leave.status === 'approved') {
          statusBadge = '<span class="leave-status-approved">✓</span>';
        } else if (leave.status === 'rejected') {
          statusBadge = '<span class="leave-status-rejected">✗</span>';
        }

        let actionButtons = '';
        if (leave.status === 'pending') {
          actionButtons = `
            <button class="btn btn-success btn-sm leave-action-btn me-1" 
                    onclick="approveLeave('${leave.id}')" title="Approve Leave">
              <i class="bi bi-check-circle"></i>
            </button>
            <button class="btn btn-danger btn-sm leave-action-btn" 
                    onclick="rejectLeave('${leave.id}')" title="Reject Leave">
              <i class="bi bi-x-circle"></i>
            </button>
          `;
        } else {
          actionButtons = `
            <button class="btn btn-outline-secondary btn-sm leave-action-btn" 
                    onclick="deleteLeave('${leave.id}')" title="Delete Leave">
              <i class="bi bi-trash"></i>
            </button>
          `;
        }

        row.innerHTML = `
          <td><strong>${escapeHtml(leave.studentId)}</strong></td>
          <td>${escapeHtml(leave.studentName)}</td>
          <td>${fromFormatted}</td>
          <td>${toFormatted}</td>
          <td><span class="badge bg-secondary">${leave.days.length}</span></td>
          <td>
            <span title="${escapeHtml(leave.reason)}">
              ${escapeHtml(leave.reason.substring(0, 30))}${leave.reason.length > 30 ? '...' : ''}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td>${actionButtons}</td>
        `;

        tbody.appendChild(row);
      });
    }

    // ==================== UPDATE STATS ====================
    function updateStats() {
      const total = leaveState.applications.length;
      const pending = leaveState.applications.filter(l => l.status === 'pending').length;
      const approved = leaveState.applications.filter(l => l.status === 'approved').length;
      const rejected = leaveState.applications.filter(l => l.status === 'rejected').length;

      document.getElementById('statsTotalLeaves').textContent = total;
      document.getElementById('statsPendingLeaves').textContent = pending;
      document.getElementById('statsApprovedLeaves').textContent = approved;
      document.getElementById('statsRejectedLeaves').textContent = rejected;
    }

    // ==================== APPROVE LEAVE ====================
    async function approveLeave(leaveId) {
  const leave = leaveState.applications.find(l => l.id === leaveId);

  if (!leave) {
    showAlert('Leave application not found', 'danger');
    return;
  }

  const confirmMsg = `✅ APPROVE LEAVE?\n\nStudent: ${leave.studentName}\nDates: ${leave.fromDate} to ${leave.toDate}\nDays: ${leave.days.length}\nReason: ${leave.reason}`;

  if (!confirm(confirmMsg)) return;

  try {
    const session = await getSession();
    const cognitoToken = session.getIdToken().getJwtToken();

    const response = await fetch('https://attendance-backend-p7uk.onrender.com/api/leave/update-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cognitoToken}`
      },
      body: JSON.stringify({
  leaveId,
  action: 'approved',
  year: leave.year,
  department: leave.department,
  course: leave.course,
  academicYear: leave.academicYear,
  division: leave.division
})
    });

    const result = await response.json();

    if (!response.ok) {
      showAlert(result.error || 'Failed to approve leave', 'danger');
      return;
    }

    await loadLeaveApplications();
    showAlert(`Leave approved for ${leave.studentName}`, 'success');

  } catch (error) {
    console.error('Error approving leave:', error);
    showAlert('Failed to approve leave. Please try again.', 'danger');
  }
}

    // ==================== REJECT LEAVE ====================
    async function rejectLeave(leaveId) {
  const leave = leaveState.applications.find(l => l.id === leaveId);

  if (!leave) {
    showAlert('Leave application not found', 'danger');
    return;
  }

  const confirmMsg = `⚠️ REJECT LEAVE?\n\nStudent: ${leave.studentName}\nDates: ${leave.fromDate} to ${leave.toDate}\nReason: ${leave.reason}`;

  if (!confirm(confirmMsg)) return;

  try {
    const session = await getSession();
    const cognitoToken = session.getIdToken().getJwtToken();

    const response = await fetch('https://attendance-backend-p7uk.onrender.com/api/leave/update-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cognitoToken}`
      },
      body: JSON.stringify({
  leaveId,
  action: 'rejected',
  year: leave.year,
  department: leave.department,
  course: leave.course,
  academicYear: leave.academicYear,
  division: leave.division
})
    });

    const result = await response.json();

    if (!response.ok) {
      showAlert(result.error || 'Failed to reject leave', 'danger');
      return;
    }

    await loadLeaveApplications();
    showAlert(`Leave rejected for ${leave.studentName}`, 'info');

  } catch (error) {
    console.error('Error rejecting leave:', error);
    showAlert('Failed to reject leave. Please try again.', 'danger');
  }
}

    // ==================== DELETE LEAVE ====================
    async function deleteLeave(leaveId) {
  const leave = leaveState.applications.find(l => l.id === leaveId);

  if (!leave) {
    showAlert('Leave application not found', 'danger');
    return;
  }

  const confirmMsg = `🗑️ DELETE LEAVE APPLICATION?\n\nStudent: ${leave.studentName}\nDates: ${leave.fromDate} to ${leave.toDate}\n\nThis action cannot be undone.`;

  if (!confirm(confirmMsg)) return;

  try {
    const session = await getSession();
    const cognitoToken = session.getIdToken().getJwtToken();

    const response = await fetch('https://attendance-backend-p7uk.onrender.com/api/leave/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cognitoToken}`
      },
      body: JSON.stringify({
  leaveId,
  year: leave.year,
  department: leave.department,
  course: leave.course,
  academicYear: leave.academicYear,
  division: leave.division
})
    });

    const result = await response.json();

    if (!response.ok) {
      showAlert(result.error || 'Failed to delete leave', 'danger');
      return;
    }

    await loadLeaveApplications();
    showAlert('Leave application deleted', 'info');

  } catch (error) {
    console.error('Error deleting leave:', error);
    showAlert('Failed to delete leave. Please try again.', 'danger');
  }
}

    // ==================== EVENT LISTENERS ====================
    function initializeEventListeners() {
      // Open Leave Form
      document.getElementById('openLeaveFormBtn').addEventListener('click', () => {
        const validation = validateDivisionContext();

        if (!validation.valid) {
          showAlert(`Please select: ${validation.missing.join(', ')} in the main system first!`, 'warning');
          return;
        }

        resetLeaveForm();
        loadStudentsForLeaveForm();

        const year = appState.selectedYear;
        const month = appState.selectedMonth;

        if (month !== null && year !== null) {
          const firstDay = new Date(year, month, 1);
          const lastDay = new Date(year, month + 1, 0);

          const fromInput = document.getElementById('leaveFromDate');
          const toInput = document.getElementById('leaveToDate');

          fromInput.min = formatDateForInput(firstDay);
          fromInput.max = formatDateForInput(lastDay);
          toInput.min = formatDateForInput(firstDay);
          toInput.max = formatDateForInput(lastDay);
        }

        if (!leaveModal) {
          leaveModal = new bootstrap.Modal(document.getElementById('leaveModal'));
        }
        leaveModal.show();
      });

      // Date change listeners
      document.getElementById('leaveFromDate').addEventListener('change', updateLeaveDayCount);
      document.getElementById('leaveToDate').addEventListener('change', updateLeaveDayCount);

      // Submit Leave
      document.getElementById('submitLeaveBtn').addEventListener('click', submitLeaveApplication);

      // Filters
      document.getElementById('leaveStatusFilter').addEventListener('change', (e) => {
        leaveState.filters.status = e.target.value;
        renderLeaveTable();
      });

      document.getElementById('leaveMonthFilter').addEventListener('change', (e) => {
        leaveState.filters.month = e.target.value;
        renderLeaveTable();
      });

      // Refresh
      document.getElementById('refreshLeavesBtn').addEventListener('click', () => {
        loadLeaveApplications();
        showAlert('Leave applications refreshed', 'info');
      });
    }

    // ==================== AUTHENTICATION CHECK ====================
    async function checkAuthAndInit() {
      try {
        const user = await getCurrentUser();

        if (!user) {
          window.location.href = 'index.html';
          return;
        }
        await signIntoFirebase();
        document.getElementById('userEmail').textContent = user.attributes.email;

        initialize();

      } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = 'index.html';
      }
    }

    // ==================== INITIALIZATION ====================
    async function initialize() {
      try {
        await initFirebase();
        await openDatabase();
        await loadContext();

        const validation = validateDivisionContext();

        if (!validation.valid) {
          showAlert(`Missing context: ${validation.missing.join(', ')}\n\nPlease select these fields in the main system first, then return here.`, 'warning');
        } else {
          await loadLeaveApplications();
        }

        initializeEventListeners();

        console.log('✅ Leave Application System initialized');

      } catch (error) {
        console.error('Initialization error:', error);
        showAlert('Failed to initialize. Please refresh the page.', 'danger');
      }
    }

    // Start application
    window.addEventListener('DOMContentLoaded', checkAuthAndInit);
  