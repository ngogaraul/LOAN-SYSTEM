import axios from "axios";
import { clearAuth, isTokenExpired } from "../auth/auth";

const api = axios.create({
  baseURL: "http://localhost:9000", // change if different
});

// attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    if (isTokenExpired(token)) {
      clearAuth();
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
      return Promise.reject(new axios.Cancel("Token expired"));
    }
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuth();
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
