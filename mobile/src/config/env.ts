/**
 * Backend API configuration.
 *
 * NOTE: Never store Gemini or cloud API keys in the mobile application.
 * All AI and external requests must go through the backend server.
 */

// Default to the computer's LAN IP on port 8000 for physical phone access
export const DEFAULT_BACKEND_URL = "http://192.168.29.201:8000";

let currentBackendUrl = DEFAULT_BACKEND_URL;

export function getBackendBaseUrl(): string {
  return currentBackendUrl;
}

export function setBackendBaseUrl(newUrl: string): string {
  let cleaned = newUrl.trim();
  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");
  if (cleaned.length > 0) {
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
      cleaned = `http://${cleaned}`;
    }
    currentBackendUrl = cleaned;
  }
  return currentBackendUrl;
}
