import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  PlusIcon,
  ChatBubbleLeftRightIcon,
  FolderIcon,
  RocketLaunchIcon,
  ChartBarIcon,
  ClockIcon,
  CodeBracketIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

// Hooks
import { useAuthStore } from '../../store/authStore';

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'development' | 'testing' | 'deployed';
  progress: number;
  lastActivity: string;
  technology: string[];
  collaborators: number;
}

interface RecentChat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  agent: string;
}

interface Stats {
  totalProjects: number;
  activeChats: number;
  codeGenerated: number;
  deploymentsToday: number;
}

const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats>({
    totalProjects: 0,
    activeChats: 0,
    codeGenerated: 0,
    deploymentsToday: 0,
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading data
    const loadDashboardData = async () => {
      setIsLoading(true);
      
      // Simulate API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setStats({
        totalProjects: 12,
        activeChats: 5,
        codeGenerated: 2847,
        deploymentsToday: 3,
      });
      
      setRecentProjects([
        {
          id: '1',
          name: 'E-commerce Platform',
          description: 'Full-stack e-commerce solution with React and Node.js',
          status: 'development',
          progress: 75,
          lastActivity: '2 hours ago',
          technology: ['React', 'Node.js', 'MongoDB'],
          collaborators: 3,
        },
        {
          id: '2',
          name: 'Task Management App',
          description: 'Collaborative task management with real-time updates',
          status: 'testing',
          progress: 90,
          lastActivity: '1 day ago',
          technology: ['Vue.js', 'Express', 'PostgreSQL'],
          collaborators: 2,
        },
        {
          id: '3',
          name: 'Analytics Dashboard',
          description: 'Real-time analytics dashboard with charts and metrics',
          status: 'deployed',
          progress: 100,
          lastActivity: '3 days ago',
          technology: ['React', 'D3.js', 'Python'],
          collaborators: 1,
        },
      ]);
      
      setRecentChats([
        {
          id: '1',
          title: 'Frontend Component Design',
          lastMessage: 'Created responsive navigation component with mobile support',
          timestamp: '5 minutes ago',
          agent: 'Frontend Agent',
        },
        {
          id: '2',
          title: 'Database Schema Optimization',
          lastMessage: 'Optimized user queries with proper indexing',
          timestamp: '1 hour ago',
          agent: 'Database Agent',
        },
        {
          id: '3',
          title: 'API Authentication Setup',
          lastMessage: 'Implemented JWT authentication with refresh tokens',
          timestamp: '3 hours ago',
          agent: 'Backend Agent',
        },
      ]);
      
      setIsLoading(false);
    };

    loadDashboardData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planning':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      case 'development':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'testing':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'deployed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              Welcome back, {user?.firstName || user?.username}! 👋
            </h1>
            <p className="text-blue-100">
              Ready to build something amazing today? Your AI coding assistants are standing by.
            </p>
          </div>
          <div className="hidden md:block">
            <SparklesIcon className="w-16 h-16 text-blue-200" />
          </div>
        </div>
        
        <div className="mt-6 flex flex-wrap gap-4">
          <Link
            to="/chat"
            className="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-md text-sm font-medium transition-colors"
          >
            <ChatBubbleLeftRightIcon className="w-4 h-4 mr-2" />
            Start New Chat
          </Link>
          <Link
            to="/projects/new"
            className="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-md text-sm font-medium transition-colors"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Create Project
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <FolderIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Projects</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalProjects}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <ChatBubbleLeftRightIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Chats</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeChats}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <CodeBracketIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Lines Generated</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.codeGenerated.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <RocketLaunchIcon className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Deployments Today</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.deploymentsToday}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Projects</h2>
              <Link
                to="/projects"
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
              >
                View all
              </Link>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h3 className="font-medium text-gray-900 dark:text-white">{project.name}</h3>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                        {project.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{project.description}</p>
                    
                    <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center">
                        <ClockIcon className="w-3 h-3 mr-1" />
                        {project.lastActivity}
                      </div>
                      <div className="flex items-center">
                        <UserGroupIcon className="w-3 h-3 mr-1" />
                        {project.collaborators} collaborator{project.collaborators !== 1 ? 's' : ''}
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400">Progress</span>
                        <span className="text-gray-900 dark:text-white font-medium">{project.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${project.progress}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="mt-3 flex flex-wrap gap-1">
                      {project.technology.map((tech) => (
                        <span
                          key={tech}
                          className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Chats */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Chats</h2>
              <Link
                to="/chat"
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
              >
                View all
              </Link>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            {recentChats.map((chat) => (
              <div
                key={chat.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-medium">
                      {chat.agent.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {chat.title}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {chat.lastMessage}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        {chat.agent}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {chat.timestamp}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/chat"
            className="flex items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
          >
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/40 transition-colors">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">New Chat</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Start coding with AI</p>
            </div>
          </Link>

          <Link
            to="/projects/new"
            className="flex items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
          >
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/40 transition-colors">
              <PlusIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">New Project</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Create from template</p>
            </div>
          </Link>

          <Link
            to="/deploy"
            className="flex items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
          >
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg group-hover:bg-purple-200 dark:group-hover:bg-purple-900/40 transition-colors">
              <RocketLaunchIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Deploy</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Launch your app</p>
            </div>
          </Link>

          <Link
            to="/analytics"
            className="flex items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
          >
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg group-hover:bg-orange-200 dark:group-hover:bg-orange-900/40 transition-colors">
              <ChartBarIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Analytics</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">View insights</p>
            </div>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardPage;