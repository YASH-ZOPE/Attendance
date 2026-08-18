// ==================== COGNITO CONFIGURATION ====================
// Environment values injected via window.ENV_CONFIG or build environment variables

const COGNITO_CONFIG = {
    region: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.COGNITO_REGION) || (typeof process !== 'undefined' && process.env && process.env.COGNITO_REGION) || "",
    userPoolId: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.COGNITO_USER_POOL_ID) || (typeof process !== 'undefined' && process.env && process.env.COGNITO_USER_POOL_ID) || "",
    clientId: (typeof window !== 'undefined' && window.ENV_CONFIG && window.ENV_CONFIG.COGNITO_CLIENT_ID) || (typeof process !== 'undefined' && process.env && process.env.COGNITO_CLIENT_ID) || ""
};

// Export for use in other files
window.COGNITO_CONFIG = COGNITO_CONFIG;
