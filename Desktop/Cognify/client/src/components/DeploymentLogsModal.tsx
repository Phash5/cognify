import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  DocumentTextIcon,
  ArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import Modal from './Modal';

interface Project {
  id: string;
  name: string;
  deploymentStatus: string;
  environment: string;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  deploymentId?: string;
}

interface DeploymentLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
}

const DeploymentLogsModal: React.FC<DeploymentLogsModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error' | 'success'>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && project) {
      fetchLogs();
      // Set up polling for real-time updates
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen, project]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    if (!project) return;

    setIsLoading(true);
    try {
      // Mock data - replace with actual API call
      const mockLogs: LogEntry[] = [
        {
          id: '1',
          timestamp: new Date('2024-01-15T10:30:00'),
          level: 'info',
          message: `Deployment started by user for ${project.name}`,
          deploymentId: 'deploy_123',
        },
        {
          id: '2',
          timestamp: new Date('2024-01-15T10:30:05'),
          level: 'info',
          message: 'Pulling latest code from repository...',
          deploymentId: 'deploy_123',
        },
        {
          id: '3',
          timestamp: new Date('2024-01-15T10:30:10'),
          level: 'info',
          message: 'Installing dependencies...',
          deploymentId: 'deploy_123',
        },
        {
          id: '4',
          timestamp: new Date('2024-01-15T10:30:15'),
          level: 'info',
          message: 'Running build command: npm run build',
          deploymentId: 'deploy_123',
        },
        {
          id: '5',
          timestamp: new Date('2024-01-15T10:30:45'),
          level: 'info',
          message: 'Build completed successfully',
          deploymentId: 'deploy_123',
        },
        {
          id: '6',
          timestamp: new Date('2024-01-15T10:31:00'),
          level: 'info',
          message: 'Creating container image...',
          deploymentId: 'deploy_123',
        },
        {
          id: '7',
          timestamp: new Date('2024-01-15T10:31:30'),
          level: 'info',
          message: 'Pushing image to registry...',
          deploymentId: 'deploy_123',
        },
        {
          id: '8',
          timestamp: new Date('2024-01-15T10:32:00'),
          level: 'info',
          message: 'Deploying to staging environment...',
          deploymentId: 'deploy_123',
        },
        {
          id: '9',
          timestamp: new Date('2024-01-15T10:32:15'),
          level: 'success',
          message: `Deployment completed successfully. Available at: https://staging-${project.name.toLowerCase().replace(/\s+/g, '-')}.cognify.app`,
          deploymentId: 'deploy_123',
        },
        {
          id: '10',
          timestamp: new Date('2024-01-15T10:32:20'),
          level: 'info',
          message: 'Health check passed - application is healthy',
          deploymentId: 'deploy_123',
        },
      ];

      // Add some conditional logs based on deployment status
      if (project.deploymentStatus === 'failed') {
        mockLogs.push({
          id: '11',
          timestamp: new Date(),
          level: 'error',
          message: 'Deployment failed: Build process encountered errors',
          deploymentId: 'deploy_123',
        });
      } else if (project.deploymentStatus === 'deploying') {
        mockLogs.push({
          id: '11',
          timestamp: new Date(),
          level: 'info',
          message: 'Deployment in progress...',
          deploymentId: 'deploy_123',
        });
      }

      setLogs(mockLogs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setAutoScroll(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircleIcon className="w-4 h-4 text-red-500" />;
      case 'warn':
        return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />;
      default:
        return <ClockIcon className="w-4 h-4 text-blue-500" />;
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const filteredLogs = filter === 'all' ? logs : logs.filter(log => log.level === filter);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <DocumentTextIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Deployment Logs
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {project?.name} - {project?.environment}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter:</span>
            {['all', 'info', 'warn', 'error', 'success'].map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level as any)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filter === level
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredLogs.length} entries
            </span>
            {!autoScroll && (
              <button
                onClick={scrollToBottom}
                className="inline-flex items-center px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                <ArrowDownIcon className="w-3 h-3 mr-1" />
                Scroll to bottom
              </button>
            )}
          </div>
        </div>

        {/* Logs Container */}
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900 font-mono text-sm"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span>Loading logs...</span>
                </div>
              ) : (
                <span>No logs available</span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start space-x-3 p-2 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getLogIcon(log.level)}
                  </div>
                  <div className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 w-20">
                    {log.timestamp.toLocaleTimeString()}
                  </div>
                  <div className={`flex-1 ${getLogColor(log.level)}`}>
                    {log.message}
                  </div>
                </motion.div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Live updates enabled</span>
            </div>
            <div className="flex items-center space-x-1">
              <ClockIcon className="w-4 h-4" />
              <span>Last updated: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
              />
              <span>Auto-scroll</span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default DeploymentLogsModal;