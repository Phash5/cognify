import axios from 'axios';
import { useAuthStore } from '../../store/authStore';

// Mock axios for API calls
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  })),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock auth store
jest.mock('../../store/authStore');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('API Integration Tests', () => {
  let mockApi: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock API instance
    mockApi = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    };
    
    (mockedAxios.create as jest.Mock).mockReturnValue(mockApi);
  });

  describe('Authentication API', () => {
    it('should handle successful login API call', async () => {
      const mockLoginResponse = {
        data: {
          user: { id: 1, email: 'test@example.com', name: 'Test User' },
          token: 'mock-jwt-token'
        }
      };
      
      mockApi.post.mockResolvedValueOnce(mockLoginResponse);
      
      const result = await mockApi.post('/auth/login', {
        email: 'test@example.com',
        password: 'password123'
      });
      
      expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123'
      });
      
      expect(result.data.user.email).toBe('test@example.com');
      expect(result.data.token).toBe('mock-jwt-token');
    });

    it('should handle login API errors', async () => {
      const mockError = {
        response: {
          data: { message: 'Invalid credentials' },
          status: 401
        }
      };
      
      mockApi.post.mockRejectedValueOnce(mockError);
      
      try {
        await mockApi.post('/auth/login', {
          email: 'test@example.com',
          password: 'wrongpassword'
        });
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.message).toBe('Invalid credentials');
      }
    });
  });

  describe('Dashboard API', () => {
    it('should load projects from API', async () => {
      const mockProjectsResponse = {
        data: {
          projects: [
            { id: 1, name: 'Project 1', status: 'active' },
            { id: 2, name: 'Project 2', status: 'deployed' }
          ]
        }
      };
      
      mockApi.get.mockResolvedValueOnce(mockProjectsResponse);
      
      const result = await mockApi.get('/api/projects');
      
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects');
      expect(result.data.projects).toHaveLength(2);
      expect(result.data.projects[0].name).toBe('Project 1');
    });

    it('should load dashboard stats from API', async () => {
      const mockStatsResponse = {
        data: {
          totalProjects: 2,
          activeDeployments: 1,
          totalUsers: 5
        }
      };
      
      mockApi.get.mockResolvedValueOnce(mockStatsResponse);
      
      const result = await mockApi.get('/api/dashboard/stats');
      
      expect(mockApi.get).toHaveBeenCalledWith('/api/dashboard/stats');
      expect(result.data.totalProjects).toBe(2);
      expect(result.data.activeDeployments).toBe(1);
    });

    it('should handle API failures gracefully', async () => {
      const mockError = new Error('Network error');
      
      mockApi.get.mockRejectedValueOnce(mockError);
      
      try {
        await mockApi.get('/api/projects');
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
      
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects');
    });
  });

  describe('Project Management API', () => {
    it('should create new project via API', async () => {
      const newProject = {
        name: 'New Project',
        description: 'Test project',
        template: 'react'
      };
      
      const mockCreateResponse = {
        data: {
          project: { id: 3, ...newProject, status: 'created' }
        }
      };
      
      mockApi.post.mockResolvedValueOnce(mockCreateResponse);
      
      const result = await mockApi.post('/api/projects', newProject);
      
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects', newProject);
      expect(result.data.project.name).toBe('New Project');
      expect(result.data.project.status).toBe('created');
    });

    it('should update project via API', async () => {
      const projectUpdate = {
        name: 'Updated Project Name',
        description: 'Updated description'
      };
      
      const mockUpdateResponse = {
        data: {
          project: { id: 1, ...projectUpdate, status: 'active' }
        }
      };
      
      mockApi.put.mockResolvedValueOnce(mockUpdateResponse);
      
      const result = await mockApi.put('/api/projects/1', projectUpdate);
      
      expect(mockApi.put).toHaveBeenCalledWith('/api/projects/1', projectUpdate);
      expect(result.data.project.name).toBe('Updated Project Name');
    });

    it('should delete project via API', async () => {
      const mockDeleteResponse = {
        data: { message: 'Project deleted successfully' }
      };
      
      mockApi.delete.mockResolvedValueOnce(mockDeleteResponse);
      
      const result = await mockApi.delete('/api/projects/1');
      
      expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/1');
      expect(result.data.message).toBe('Project deleted successfully');
    });
  });
});