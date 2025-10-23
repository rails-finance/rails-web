const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN;

/**
 * Creates fetch options with Authorization header for Rails API requests
 */
export function createAuthHeaders(): HeadersInit {
  if (!API_BEARER_TOKEN) {
    console.warn("API_BEARER_TOKEN environment variable is not set");
    return {};
  }

  return {
    Authorization: `Bearer ${API_BEARER_TOKEN}`,
  };
}

/**
 * Creates fetch options with Authorization header and optional additional options
 */
export function createAuthFetchOptions(additionalOptions?: RequestInit): RequestInit {
  return {
    ...additionalOptions,
    headers: {
      ...createAuthHeaders(),
      ...additionalOptions?.headers,
    },
  };
}
