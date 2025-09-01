import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RocketLaunchIcon,
  CloudIcon,
  CogIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
  EyeIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import DeploymentModal from '../../components/DeploymentModal';
import DeploymentLogsModal from '../../components/DeploymentLogsModal';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'development' | 'testing' | 'deployed';
  lastDeployment?: Date;
  deploymentStatus: 'idle' | 'deploying' | 'deployed' | 'failed';
  environment: 'development' | 'staging' | 'production';
  url?: string;
  buildStatus: 'pending' | 'building' | 'success' | 'failed';
  healthCheck?: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    lastCheck: Date;
    responseTime: number;
  };
}

interface DeploymentEnvironment {
  name: string;
  description: string;
  features: string[];
  url: string;
}

const DeployPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<DeploymentEnvironment[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDeploymentModalOpen, setIsDeploymentModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('staging');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
    fetchEnvironments();
  }, []);

  const fetchProjects = async () => {
    try {
      // Mock data - replace with actual API call
      const mockProjects: Project[] = [
        {
          id: '1',
          name: 'E-commerce Platform',
          description: 'Modern e-commerce solution with React and Node.js',
          status: 'deployed',
          lastDeployment: new Date('2024-01-15T10:30:00'),
          deploymentStatus: 'deployed',
          environment: 'production',
          url: 'https://ecommerce-platform.cognify.app',
          buildStatus: 'success',
          healthCheck: {
            status: 'healthy',
            lastCheck: new Date(),
            responseTime: 120,
          },
        },
        {
          id: '2',
          name: 'Task Management App',
          description: 'Collaborative task management with real-time updates',
          status: 'testing',
          lastDeployment: new Date('2024-01-14T15:45:00'),
          deploymentStatus: 'deployed',
          environment: 'staging',
          url: 'https://staging-taskapp.cognify.app',
          buildStatus: 'success',
          healthCheck: {
            status: 'healthy',
            lastCheck: new Date(),
            responseTime: 95,
          },
        },
        {
          id: '3',
          name: 'Analytics Dashboard',
          description: 'Real-time analytics and reporting dashboard',
          status: 'development',
          deploymentStatus: 'idle',
          environment: 'development',
          buildStatus: 'pending',
        },
        {
          id: '4',
          name: 'Blog Platform',
          description: 'Content management system for blogs',
          status: 'development',
          deploymentStatus: 'failed',
          environment: 'development',
          buildStatus: 'failed',
          lastDeployment: new Date('2024-01-13T09:20:00'),
        },
      ];
      setProjects(mockProjects);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEnvironments = async () => {
    try {
      // Mock data - replace with actual API call
      const mockEnvironments: DeploymentEnvironment[] = [
        {
          name: 'development',
          description: 'Development environment for testing',
          features: ['Hot reload', 'Debug mode', 'Development tools'],
          url: 'https://dev-{project-name}.cognify.app',
        },
        {
          name: 'staging',
          description: 'Staging environment for pre-production testing',
          features: ['Production-like', 'Testing tools', 'Performance monitoring'],
          url: 'https://staging-{project-name}.cognify.app',
        },
        {
          name: 'production',
          description: 'Production environment for live applications',
          features: ['High availability', 'Auto-scaling', 'Monitoring', 'CDN'],
          url: 'https://{project-name}.cognify.app',
        },
      ];
      setEnvironments(mockEnvironments);
    } catch (error) {
      console.error('Failed to fetch environments:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'deployed':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'deploying':
        return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'deployed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'deploying':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'unhealthy':
        return 'text-red-500';
      default:
        return 'text-gray-400';
    }
  };

  const handleDeploy = (project: Project) => {
    setSelectedProject(project);
    setIsDeploymentModalOpen(true);
  };

  const handleViewLogs = (project: Project) => {
    setSelectedProject(project);
    setIsLogsModalOpen(true);
  };

  const handleStopDeployment = async (projectId: string) => {
    try {
      // API call to stop deployment
      console.log('Stopping deployment for project:', projectId);
      // Update project status
      setProjects(prev => prev.map(p => 
        p.id === projectId 
          ? { ...p, deploymentStatus: 'idle', buildStatus: 'pending' }
          : p
      ));
    } catch (error) {
      console.error('Failed to stop deployment:', error);
    }
  };

  const handleRedeploy = (project: Project) => {
    setSelectedProject(project);
    setSelectedEnvironment(project.environment);
    setIsDeploymentModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Deployment Center
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage and monitor your application deployments across all environments
              </p>
            </div>
            <button
              onClick={() => setIsDeploymentModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              <RocketLaunchIcon className="w-5 h-5 mr-2" />
              New Deployment
            </button>
          </div>
        </motion.div>

        {/* Environment Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        >
          {environments.map((env) => {
            const projectsInEnv = projects.filter(p => p.environment === env.name);
            const activeDeployments = projectsInEnv.filter(p => p.deploymentStatus === 'deployed').length;
            
            return (
              <div key={env.name} className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                    {env.name}
                  </h3>
                  <CloudIcon className="w-6 h-6 text-blue-500" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {env.description}
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Active Deployments</span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {activeDeployments}/{projectsInEnv.length}
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Projects List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Project Deployments
            </h2>
          </div>
          
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {projects.map((project) => (
              <div key={project.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Link
                        to={`/projects/${project.id}`}
                        className="text-lg font-semibold text-gray-900 dark:text-white hover:text-blue-500 dark:hover:text-blue-400"
                      >
                        {project.name}
                      </Link>
                      {getStatusIcon(project.deploymentStatus)}
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.deploymentStatus)}`}>
                        {project.deploymentStatus.charAt(0).toUpperCase() + project.deploymentStatus.slice(1)}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 capitalize">
                        {project.environment}
                      </span>
                    </div>
                    
                    <p className="text-gray-600 dark:text-gray-400 mb-3">
                      {project.description}
                    </p>
                    
                    <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
                      {project.url && (
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <GlobeAltIcon className="w-4 h-4" />
                          <span>{project.url}</span>
                        </a>
                      )}
                      
                      {project.lastDeployment && (
                        <span className="flex items-center space-x-1">
                          <ClockIcon className="w-4 h-4" />
                          <span>Last deployed {new Date(project.lastDeployment).toLocaleDateString()}</span>
                        </span>
                      )}
                      
                      {project.healthCheck && (
                        <span className="flex items-center space-x-1">
                          <div className={`w-2 h-2 rounded-full ${getHealthStatusColor(project.healthCheck.status)}`}></div>
                          <span className={getHealthStatusColor(project.healthCheck.status)}>
                            {project.healthCheck.status} ({project.healthCheck.responseTime}ms)
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {project.deploymentStatus === 'deploying' ? (
                      <button
                        onClick={() => handleStopDeployment(project.id)}
                        className="inline-flex items-center px-3 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                      >
                        <StopIcon className="w-4 h-4 mr-1" />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeploy(project)}
                        className="inline-flex items-center px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                      >
                        <PlayIcon className="w-4 h-4 mr-1" />
                        Deploy
                      </button>
                    )}
                    
                    {project.deploymentStatus === 'deployed' && (
                      <button
                        onClick={() => handleRedeploy(project)}
                        className="inline-flex items-center px-3 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                      >
                        <ArrowPathIcon className="w-4 h-4 mr-1" />
                        Redeploy
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleViewLogs(project)}
                      className="inline-flex items-center px-3 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      <DocumentTextIcon className="w-4 h-4 mr-1" />
                      Logs
                    </button>
                    
                    <Link
                      to={`/projects/${project.id}`}
                      className="inline-flex items-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      <EyeIcon className="w-4 h-4 mr-1" />
                      View
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Deployment Modal */}
      <DeploymentModal
        isOpen={isDeploymentModalOpen}
        onClose={() => {
          setIsDeploymentModalOpen(false);
          setSelectedProject(null);
        }}
        project={selectedProject}
        environments={environments}
        onDeploymentStarted={(projectId, environment) => {
          setProjects(prev => prev.map(p => 
            p.id === projectId 
              ? { ...p, deploymentStatus: 'deploying', environment, buildStatus: 'building' }
              : p
          ));
        }}
      />

      {/* Deployment Logs Modal */}
      <DeploymentLogsModal
        isOpen={isLogsModalOpen}
        onClose={() => {
          setIsLogsModalOpen(false);
          setSelectedProject(null);
        }}
        project={selectedProject}
      />
    </div>
  );
};

export default DeployPage;