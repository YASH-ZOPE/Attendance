// ==================== COGNITO CONFIGURATION ====================
// Placeholder values — real values injected at build time via AWS Amplify

const COGNITO_CONFIG = {
    region: 'YOUR_AWS_REGION',                    // REPLACE with your region
    userPoolId: 'YOUR_USER_POOL_ID',              // REPLACE with your User Pool ID
    clientId: 'YOUR_CLIENT_ID'                    // REPLACE with your Client ID
};

// Export for use in other files
window.COGNITO_CONFIG = COGNITO_CONFIG;
