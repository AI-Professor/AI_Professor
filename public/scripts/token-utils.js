// token-utils.js - Add this as a new file in your /public/scripts directory

// Function to parse JWT token expiration time
export function getTokenExpiration(token) {
    if (!token) return null;
    
    try {
      // Parse the JWT payload
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
  
      const { exp } = JSON.parse(jsonPayload);
      return exp * 1000; // Convert to milliseconds
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }
  
  // Function to check if token needs refreshing (5 minutes before expiry)
  export function tokenNeedsRefresh(token) {
    const expTime = getTokenExpiration(token);
    if (!expTime) return true;
    
    // Calculate refresh threshold (5 minutes before expiration)
    const refreshThreshold = 5 * 60 * 1000; // 5 minutes in ms
    const currentTime = Date.now();
    
    return expTime - currentTime < refreshThreshold;
  }
  
  // Refresh token function
  export async function refreshAccessToken(localBackendUrl) {
    try {
      const currentToken = sessionStorage.getItem('accessToken');
      if (!currentToken) {
        console.log('No token to refresh');
        return false;
      }
      
      const refreshUrl = `${localBackendUrl}/api/refresh-token`;
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Token refresh failed:', response.status);
        // If the server specifically says the token is invalid, clear it
        if (response.status === 401) {
          sessionStorage.removeItem('accessToken');
        }
        return false;
      }
      
      const data = await response.json();
      
      // Store the new token
      sessionStorage.setItem('accessToken', data.access_token);
      console.log('Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }
  
  // Setup token refresh interval
  export function setupTokenRefresh(localBackendUrl) {
    // Check token every minute
    const interval = setInterval(async () => {
      const token = sessionStorage.getItem('accessToken');
      
      if (!token) {
        // No token, no need to refresh
        return;
      }
      
      // Check if token needs refresh
      if (tokenNeedsRefresh(token)) {
        console.log('Token needs refresh, attempting to refresh...');
        const success = await refreshAccessToken(localBackendUrl);
        
        if (!success) {
          console.log('Token refresh failed, clearing interval');
          clearInterval(interval);
        }
      }
    }, 60000); // Check every minute
    
    // Also return the interval so it can be cleared if needed
    return interval;
  }