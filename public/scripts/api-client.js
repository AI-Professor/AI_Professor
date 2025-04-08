import { refreshAccessToken } from './token-utils.js';

// Wrapper for fetch that handles token refresh
export async function apiFetch(url, options = {}) {
  // Clone the options to avoid modifying the original
  const fetchOptions = { ...options };
  
  // Add auth header if token exists and it's not already set
  const token = sessionStorage.getItem('accessToken');
  if (token && (!fetchOptions.headers || !fetchOptions.headers['Authorization'])) {
    fetchOptions.headers = {
      ...fetchOptions.headers,
      'Authorization': `Bearer ${token}`
    };
  }
  
  try {
    // First attempt
    let response = await fetch(url, fetchOptions);
    
    // If unauthorized and we have a token, try refreshing
    if (response.status === 401 && token) {
      console.log('Unauthorized response, attempting token refresh...');
      
      // Extract base URL for the refresh endpoint
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      
      // Try to refresh the token
      const refreshed = await refreshAccessToken(baseUrl);
      
      if (refreshed) {
        // Update authorization header with new token
        const newToken = sessionStorage.getItem('accessToken');
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Authorization': `Bearer ${newToken}`
        };
        
        // Retry the request with new token
        console.log('Token refreshed, retrying request...');
        response = await fetch(url, fetchOptions);
      }
    }
    
    return response;
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
}

// GET helper
export async function apiGet(url, options = {}) {
  return apiFetch(url, { ...options, method: 'GET' });
}

// POST helper
export async function apiPost(url, data, options = {}) {
  const fetchOptions = {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: JSON.stringify(data)
  };
  
  return apiFetch(url, fetchOptions);
}

// Form POST helper (for multipart/form-data)
export async function apiFormPost(url, formData, options = {}) {
  const fetchOptions = {
    ...options,
    method: 'POST',
    body: formData
  };
  
  return apiFetch(url, fetchOptions);
}