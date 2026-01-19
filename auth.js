/**
 * AWS Cognito Authentication Module
 * Handles all authentication operations for the Smart Attendance System
 */

// Global variables
let userPool = null;
let currentUser = null;

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
 * Sign up a new user
 * @param {string} email - User's email
 * @param {string} name - User's full name
 * @param {string} password - User's password
 * @returns {Promise} - Resolves with user data
 */
function signup(email, name, password) {
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
      })
    ];

    userPool.signUp(email, password, attributeList, null, (err, result) => {
      if (err) {
        console.error('Signup error:', err);
        reject(err);
        return;
      }

      console.log('✓ User signed up successfully:', result.user.getUsername());
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
 * Redirect user based on their role
 * @returns {Promise}
 */
async function redirectBasedOnRole() {
  try {
    const role = await getUserRole();
    console.log('Redirecting user with role:', role);

    if (role === 'admin' || role === 'teacher') {
      window.location.href = 'main-system.html';
    } else if (role === 'student') {
      window.location.href = 'face-recognition.html';
    } else {
      // Default to face recognition for unknown roles
      window.location.href = 'face-recognition.html';
    }
  } catch (error) {
    console.error('Redirect error:', error);
    throw error;
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
 * Get user attributes
 * @returns {Promise} - Resolves with user attributes object
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

        const attrs = {};
        attributes.forEach(attr => {
          attrs[attr.Name] = attr.Value;
        });

        resolve(attrs);
      });
    });
  });
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
    getUserRole,
    isAuthenticated,
    isAdmin,
    isTeacher,
    isStudent,
    redirectBasedOnRole,
    forgotPassword,
    confirmPasswordReset,
    changePassword,
    getUserAttributes
  };
}