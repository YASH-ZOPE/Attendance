// ==================== COGNITO CONFIGURATION ====================
// Replace these values with YOUR credentials from cognito-credentials.txt

const COGNITO_CONFIG = {
    region: 'ap-south-1',                    // REPLACE with your region
    userPoolId: 'ap-south-1_JsWqNfIto',      // REPLACE with your User Pool ID
    clientId: '7i9vgkp2m0ifchpdjuas555v9e'   // REPLACE with your Client ID
};

// Export for use in other files
window.COGNITO_CONFIG = COGNITO_CONFIG;