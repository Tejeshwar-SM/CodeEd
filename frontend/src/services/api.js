import axios from 'axios';

const API_URL = 'http://localhost:8000/api/';

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor for API calls
apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Token ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Response interceptor for API calls
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      // Auto logout if 401 response returned from api
      localStorage.removeItem('token');
      window.location = '/login';
    }
    return Promise.reject(error);
  }
);

export const auth = {
  login: (credentials) => apiClient.post('token/', credentials),
  register: (userData) => apiClient.post('auth/register/', userData),
  me: () => apiClient.get('auth/me/'),
  logout: () => {
    localStorage.removeItem('token');
  }
};

export const projects = {
  getAll: () => apiClient.get('projects/'),
  get: (id) => apiClient.get(`projects/${id}/`),
  create: (data) => apiClient.post('projects/', data),
  update: (id, data) => apiClient.put(`projects/${id}/`, data),
  delete: (id) => apiClient.delete(`projects/${id}/`),
};

export const files = {
  getAll: (projectId) => apiClient.get('files/', { params: { project: projectId } }),
  get: (id) => apiClient.get(`files/${id}/`),
  getContent: (id) => apiClient.get(`files/${id}/content/`),
  create: (data) => apiClient.post('files/', data),
  update: (id, data) => apiClient.put(`files/${id}/`, data),
  updateContent: (id, data) => apiClient.put(`files/${id}/content/`, data),
  delete: (id) => apiClient.delete(`files/${id}/`),
};

export const preferences = {
  get: () => apiClient.get('user-preferences/'),
  create: (data) => apiClient.post('user-preferences/', data),
  update: (id, data) => apiClient.put(`user-preferences/${id}/`, data),
};

export const code = {
  execute: (data) => apiClient.post('execute/', data),
};

export default apiClient;