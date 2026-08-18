// ==================== COGNITO CONFIGURATION ====================
// Loaded dynamically at runtime from .env (window.ENV) or AWS Amplify build injection
const getEnvVar = (key) => {
    if (typeof window !== 'undefined' && window.ENV && window.ENV[key]) {
        return window.ENV[key];
    }
    return "";
};

const COGNITO_CONFIG = {
    region: getEnvVar('COGNITO_REGION'),
    userPoolId: getEnvVar('COGNITO_USER_POOL_ID'),
    clientId: getEnvVar('COGNITO_CLIENT_ID')
};

// Export for use in other files
window.COGNITO_CONFIG = COGNITO_CONFIG;
