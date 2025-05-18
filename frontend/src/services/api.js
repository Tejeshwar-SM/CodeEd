import axios from 'axios'

const API_URL = 'http://localhost:8000/api/'

const apiClient = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    }
});

apiClient.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token');
        if(token) {
            config.headers['Authorization'] = `Token ${token}`;
        }
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

export const auth ={
    login: (username, password) => {
        return apiClient.post('token/', {username, password});
    },
    logout: () => {
        localStorage.removeItem('token');
    }
};

export const projects ={
    getAll: () => apiClient.get('projects/'),
    get: (id) => apiClient.get(`projects/${id}/`),
    create: (data) => apiClient.post('projects/', data),
    update: (id, data) => apiClient.put(`projects/${id}/`, data),
    delete: (id) => apiClient.delete(`projects/${id}/`),
}

export const files = {
  getAll: () => apiClient.get('files/'),
  get: (id) => apiClient.get(`files/${id}/`),
  getContent: (id) => apiClient.get(`files/${id}/content/`),
  create: (data) => apiClient.post('files/', data),
  update: (id, data) => apiClient.put(`files/${id}/`, data),
  updateContent: (id, data) => apiClient.put(`files/${id}/content/`, data),
  delete: (id) => apiClient.delete(`files/${id}/`)
};

export const preferences = {
  get: () => apiClient.get('user-preferences/'),
  update: (id, data) => apiClient.put(`user-preferences/${id}/`, data),
  create: (data) => apiClient.post('user-preferences/', data)
};