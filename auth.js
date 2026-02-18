/**
 * auth.js
 * AWS Cognito Authentication Module
 * Handles all authentication operations for the Smart Attendance System
 */

// ADD THIS at the very top of auth.js file
const LAMBDA_AUTH_URL = 'https://nxcqmkrqanlh34jxrq5sjlcebi0dqpoj.lambda-url.ap-south-1.on.aws/';

// Global variables
let userPool = null;
let currentUser = null;

async function signIntoFirebase() {
  try {
    // Get current Cognito user
    const user = await getCurrentUser();
    
    if (!user) {
      throw new Error('No user logged in');
    }
    
    // ✅ FIX: Get session FIRST
    const session = await getSession();
    const cognitoToken = session.getIdToken().getJwtToken();
    
    // ✅ FIX: Get role from session token (groups)
    const idToken = session.getIdToken();
    const payload = idToken.decodePayload();
    const groups = payload['cognito:groups'] || [];
    
    let role = 'student';  // Default
    if (groups.includes('admin')) {
      role = 'admin';
    } else if (groups.includes('teacher')) {
      role = 'teacher';
    }
    
    const attributes = await getUserAttributes();
    const email = attributes.email;
    const studentId = attributes['custom:studentId'] || null;
    
    console.log('🔐 Getting Firebase token for:', email, '- Role:', role);
    
    // ✅ ADD DEBUG
    console.log('📤 Sending to Lambda:', { email, role, studentId });
    
    // Call Lambda to get Firebase custom token
    const response = await fetch(LAMBDA_AUTH_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cognitoToken}`
      },
      body: JSON.stringify({
        email: email,
        role: role,
        studentId: studentId
      })
    });
    
    console.log('📥 Lambda status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('📥 Lambda error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log('🔍 Lambda response:', result);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get Firebase token');
    }
    
    // Sign into Firebase with the custom token
    await firebase.auth().signInWithCustomToken(result.token);
    
    console.log('✅ Signed into Firebase with role:', role);
    return true;
    
  } catch (error) {
    console.error('❌ Firebase sign-in failed:', error);
    alert('Authentication error. Please refresh and try again.');
    return false;
  }
}
/**
 * Initialize AWS Cognito User Pool
 */
function initCognito() {
  if (!window.AmazonCognitoIdentity) {
    console.error('AWS Cognito SDK not loaded');
    return false;
  }

  if (!window.COGNITO_CONFIG) {
    console.error('Cognito configuration not found. Please check cognito-config.js');
    return false;
  }

  const poolData = {
    UserPoolId: COGNITO_CONFIG.userPoolId,
    ClientId: COGNITO_CONFIG.clientId
  };

  userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
  console.log('✓ Cognito initialized successfully');
  return true;
}

/**
 * Sign up a new user with division attributes
 * @param {string} email - User's email
 * @param {string} name - User's full name
 * @param {string} password - User's password
 * @param {string} studentId - Student's ID/Roll Number
 * @param {string} department - Student's department
 * @param {string} course - Student's course
 * @param {string} academicYear - Student's academic year (FY/SY/TY)
 * @param {string} division - Student's division (Division A/B/C)
 * @returns {Promise} - Resolves with user data
 */
function signup(email, name, password, studentId, department, course, academicYear, division) {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const attributeList = [
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'email',
        Value: email
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'name',
        Value: name
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:studentId',
        Value: studentId
      }),
      
      // Add custom division attributes
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:department',
        Value: department
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:course',
        Value: course
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:academicYear',
        Value: academicYear
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:division',
        Value: division
      })
    ];

    userPool.signUp(email, password, attributeList, null, (err, result) => {
      if (err) {
        console.error('Signup error:', err);
        reject(err);
        return;
      }

      console.log('✓ User signed up successfully:', result.user.getUsername());
      console.log('✓ Division assigned:', { department, course, academicYear, division });
      resolve(result);
    });
  });
}

/**
 * Verify email with confirmation code
 * @param {string} email - User's email
 * @param {string} code - 6-digit verification code
 * @returns {Promise}
 */
function verifyEmail(email, code) {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const userData = {
      Username: email,
      Pool: userPool
    };

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) {
        console.error('Verification error:', err);
        reject(err);
        return;
      }

      console.log('✓ Email verified successfully');
      resolve(result);
    });
  });
}

/**
 * Resend verification code
 * @param {string} email - User's email
 * @returns {Promise}
 */
function resendVerificationCode(email) {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const userData = {
      Username: email,
      Pool: userPool
    };

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.resendConfirmationCode((err, result) => {
      if (err) {
        console.error('Resend code error:', err);
        reject(err);
        return;
      }

      console.log('✓ Verification code resent');
      resolve(result);
    });
  });
}

/**
 * Login user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise} - Resolves with session data
 */
function login(email, password) {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const authenticationData = {
      Username: email,
      Password: password
    };

    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);

    const userData = {
      Username: email,
      Pool: userPool
    };

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: async (result) => {
        console.log('✓ Login successful');
        currentUser = cognitoUser;

        // Get user role and redirect
        try {
          await redirectBasedOnRole();
          resolve(result);
        } catch (error) {
          console.error('Redirect error:', error);
          reject(error);
        }
      },

      onFailure: (err) => {
        console.error('Login error:', err);
        reject(err);
      },

      newPasswordRequired: (userAttributes, requiredAttributes) => {
        // Handle new password required scenario
        console.log('New password required');
        reject(new Error('Password change required. Please contact administrator.'));
      }
    });
  });
}

/**
 * Logout current user
 * @returns {Promise}
 */
function logout() {
  return new Promise((resolve) => {
    if (!userPool) initCognito();

    const cognitoUser = userPool.getCurrentUser();
    
    if (cognitoUser) {
      cognitoUser.signOut();
      console.log('✓ User logged out');
    }
    
    currentUser = null;
    resolve();
  });
}

/**
 * Get current logged in user
 * @returns {Promise} - Resolves with user object or null
 */
function getCurrentUser() {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        console.error('Get session error:', err);
        reject(err);
        return;
      }

      if (!session.isValid()) {
        resolve(null);
        return;
      }

      cognitoUser.getUserAttributes((err, attributes) => {
        if (err) {
          console.error('Get attributes error:', err);
          reject(err);
          return;
        }

        const userInfo = {
          username: cognitoUser.getUsername(),
          attributes: {}
        };

        attributes.forEach(attr => {
          userInfo.attributes[attr.Name] = attr.Value;
        });

        currentUser = cognitoUser;
        resolve(userInfo);
      });
    });
  });
}

/**
 * Get current Cognito session
 * @returns {Promise} - Resolves with session object
 */
function getSession() {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      reject(new Error('No user logged in'));
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        reject(err);
        return;
      }

      if (!session.isValid()) {
        reject(new Error('Session is invalid'));
        return;
      }

      resolve(session);
    });
  });
}

/**
 * Get user's role from Cognito groups
 * @returns {Promise<string>} - Returns 'admin', 'teacher', 'student', or null
 */
function getUserRole() {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        console.error('Get session error:', err);
        reject(err);
        return;
      }

      if (!session.isValid()) {
        resolve(null);
        return;
      }

      // Get groups from ID token
      const idToken = session.getIdToken();
      const payload = idToken.decodePayload();
      const groups = payload['cognito:groups'] || [];

      console.log('User groups:', groups);

      // Priority: admin > teacher > student
      if (groups.includes('admin')) {
        resolve('admin');
      } else if (groups.includes('teacher')) {
        resolve('teacher');
      } else if (groups.includes('student')) {
        resolve('student');
      } else {
        // Default to student if no group assigned
        resolve('student');
      }
    });
  });
}

/**
 * Get user's profile attributes from Cognito
 * @returns {Promise<object>} - Returns user attributes object
 */
function getUserAttributes() {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      reject(new Error('No user logged in'));
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        reject(err);
        return;
      }

      cognitoUser.getUserAttributes((err, attributes) => {
        if (err) {
          reject(err);
          return;
        }

        // Convert attributes array to object
        const attrs = {};
        attributes.forEach(attr => {
          attrs[attr.Name] = attr.Value;
        });

        resolve(attrs);
      });
    });
  });
}

/**
 * Check if user profile is complete
 * @returns {Promise<boolean>}
 */
async function isProfileComplete() {
  try {
    const attrs = await getUserAttributes();
    
    const hasCompleteProfile = attrs['custom:studentId'] &&    
                          attrs['custom:department'] && 
                          attrs['custom:course'] && 
                          attrs['custom:academicYear'] && 
                          attrs['custom:division'];
    
    return hasCompleteProfile;
  } catch (error) {
    console.error('Error checking profile completion:', error);
    return false;
  }
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>}
 */
function isAuthenticated() {
  return new Promise((resolve) => {
    getCurrentUser()
      .then(user => resolve(user !== null))
      .catch(() => resolve(false));
  });
}

/**
 * Check if user is admin
 * @returns {Promise<boolean>}
 */
async function isAdmin() {
  try {
    const role = await getUserRole();
    return role === 'admin';
  } catch (error) {
    return false;
  }
}

/**
 * Check if user is teacher
 * @returns {Promise<boolean>}
 */
async function isTeacher() {
  try {
    const role = await getUserRole();
    return role === 'teacher';
  } catch (error) {
    return false;
  }
}

/**
 * Check if user is student
 * @returns {Promise<boolean>}
 */
async function isStudent() {
  try {
    const role = await getUserRole();
    return role === 'student';
  } catch (error) {
    return false;
  }
}

/**
 * Redirect user based on their role and profile completion
 * @returns {Promise}
 */
async function redirectBasedOnRole() {
  try {
    console.log('=== REDIRECT DEBUG START ===');
    
    // Get role first
    const role = await getUserRole();
    console.log('User role:', role);
    
    // Admin and teachers skip profile check
    if (role === 'admin' || role === 'teacher') {
      console.log('Admin/Teacher - redirecting to main-system');
      window.location.href = '/main-system';
      return;
    }
    
    // For students, check if profile is complete
    const profileComplete = await isProfileComplete();
    console.log('Student profile complete?', profileComplete);
    
    if (!profileComplete) {
      console.log('Profile incomplete, redirecting to profile page');
      window.location.href = '/profile';
      return;
    }

    // Profile complete - redirect to face recognition
    console.log('Redirecting to main-system');
    window.location.href = '/main-system';
    
    console.log('=== REDIRECT DEBUG END ===');
  } catch (error) {
    console.error('Redirect error:', error);
    
    // If there's an error, redirect to login
    window.location.href = '/';
  }
}
/**
 * Forgot password - Send reset code to email
 * @param {string} email - User's email
 * @returns {Promise}
 */
function forgotPassword(email) {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const userData = {
      Username: email,
      Pool: userPool
    };

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.forgotPassword({
      onSuccess: (result) => {
        console.log('✓ Password reset code sent');
        resolve(result);
      },
      onFailure: (err) => {
        console.error('Forgot password error:', err);
        reject(err);
      }
    });
  });
}

// Logout function (if you add logout button)
    async function handleLogout() {
      if (confirm('Are you sure you want to logout?')) {
        await logout();
        window.location.href = '/';
      }
    }

/**
 * Confirm password reset with code
 * @param {string} email - User's email
 * @param {string} code - Verification code
 * @param {string} newPassword - New password
 * @returns {Promise}
 */
function confirmPasswordReset(email, code, newPassword) {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const userData = {
      Username: email,
      Pool: userPool
    };

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => {
        console.log('✓ Password reset successful');
        resolve();
      },
      onFailure: (err) => {
        console.error('Password reset error:', err);
        reject(err);
      }
    });
  });
}

/**
 * Change password for logged in user
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise}
 */
function changePassword(oldPassword, newPassword) {
  return new Promise((resolve, reject) => {
    if (!userPool) initCognito();

    const cognitoUser = userPool.getCurrentUser();

    if (!cognitoUser) {
      reject(new Error('No user logged in'));
      return;
    }

    cognitoUser.getSession((err, session) => {
      if (err) {
        reject(err);
        return;
      }

      cognitoUser.changePassword(oldPassword, newPassword, (err, result) => {
        if (err) {
          console.error('Change password error:', err);
          reject(err);
          return;
        }

        console.log('✓ Password changed successfully');
        resolve(result);
      });
    });
  });
}

/**
 * Get user's division attributes (department, course, year, division)
 * @returns {Promise} - Resolves with division object
 */
function getDivisionAttributes() {
  return new Promise(async (resolve, reject) => {
    try {
      const attrs = await getUserAttributes();
      
      const division = {
        department: attrs['custom:department'] || null,
        course: attrs['custom:course'] || null,
        academicYear: attrs['custom:academicYear'] || null,
        division: attrs['custom:division'] || null
      };
      
      console.log('✓ Division attributes:', division);
      resolve(division);
      
    } catch (error) {
      console.error('Error getting division attributes:', error);
      reject(error);
    }
  });
}

/**
 * Check if user has complete division attributes
 * @returns {Promise<boolean>}
 */
async function hasCompleteDivisionInfo() {
  try {
    const division = await getDivisionAttributes();
    
    return !!(
      division.department && 
      division.course && 
      division.academicYear && 
      division.division
    );
    
  } catch (error) {
    console.error('Error checking division info:', error);
    return false;
  }
}

// Initialize Cognito on script load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initCognito();
  });
}

// Export functions for use in other scripts
if (typeof window !== 'undefined') {
  window.authFunctions = {
    initCognito,
    signup,
    verifyEmail,
    resendVerificationCode,
    login,
    logout,
    getCurrentUser,
    getSession,
    getUserRole,
    getUserAttributes,
    isProfileComplete,
    isAuthenticated,
    isAdmin,
    isTeacher,
    isStudent,
    redirectBasedOnRole,
    forgotPassword,
    confirmPasswordReset,
    changePassword,
    getDivisionAttributes,
    hasCompleteDivisionInfo
  };
}