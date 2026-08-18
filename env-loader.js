/**
 * env-loader.js
 * Dynamically loads environment variables from .env file into window.ENV at runtime.
 * Eliminates hardcoding API keys, secrets, and database URLs in source code files.
 */
(function () {
  window.ENV = window.ENV || {};

  try {
    const xhr = new XMLHttpRequest();
    // Synchronous load before config scripts execute
    xhr.open('GET', '.env', false);
    xhr.send(null);

    if (xhr.status === 200 && xhr.responseText) {
      const lines = xhr.responseText.split(/\r?\n/);
      lines.forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
          const firstEq = line.indexOf('=');
          const key = line.substring(0, firstEq).trim();
          const value = line.substring(firstEq + 1).trim();
          if (key) {
            window.ENV[key] = value;
          }
        }
      });
      console.log('✅ Environment variables loaded dynamically from .env');
    }
  } catch (error) {
    console.warn('⚠️ Dynamic .env fetch unavailable (using fallback environment values):', error);
  }
})();
