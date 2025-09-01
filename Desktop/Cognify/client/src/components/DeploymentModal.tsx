import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  RocketLaunchIcon,
  CloudIcon,
  CogIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import Modal from './Modal';

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  environment: string;
}

interface DeploymentEnvironment {
  name: string;
  description: string;
  features: string[];
  url: string;
}

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null;
  environments: DeploymentEnvironment[];
  onDeploymentStarted: (projectId: string, environment: string) => void;
}

interface DeploymentConfig {
  environment: string;
  buildCommand: string;
  startCommand: string;
  environmentVariables: { [key: string]: string };
  autoScale: boolean;
  minInstances: number;
  maxInstances: number;
  healthCheckPath: string;
}

const DeploymentModal: React.FC<DeploymentModalProps> = ({
  isOpen,
  onClose,
  project,
  environments,
  onDeploymentStarted,
}) => {
  const [config, setConfig] = useState<DeploymentConfig>({
    environment: 'staging',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    environmentVariables: {},
    autoScale: false,
    minInstances: 1,
    maxInstances: 3,
    healthCheckPath: '/health',
  });
  const [envVarKey, setEnvVarKey] = useState('');
  const [envVarValue, setEnvVarValue] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (project) {
      setConfig(prev => ({
        ...prev,
        environment: project.environment || 'staging',
      }));
    }
  }, [project]);

  const handleInputChange = (field: keyof DeploymentConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const addEnvironmentVariable = () => {
    if (envVarKey && envVarValue) {
      setConfig(prev => ({
        ...prev,
        environmentVariables: {
          ...prev.environmentVariables,
          [envVarKey]: envVarValue,
        },
      }));
      setEnvVarKey('');
      setEnvVarValue('');
    }
  };

  const removeEnvironmentVariable = (key: string) => {
    setConfig(prev => {
      const newEnvVars = { ...prev.environmentVariables };
      delete newEnvVars[key];
      return { ...prev, environmentVariables: newEnvVars };
    });
  };

  const handleDeploy = async () => {
    if (!project) return;

    setIsDeploying(true);
    try {
      // API call to start deployment
      const response = await fetch(`/api/deploy/${project.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        onDeploymentStarted(project.id, config.environment);
        onClose();
      } else {
        throw new Error('Deployment failed to start');
      }
    } catch (error) {
      console.error('Deployment error:', error);
      // Handle error (show toast, etc.)
    } finally {
      setIsDeploying(false);
    }
  };

  const selectedEnvironment = environments.find(env => env.name === config.environment);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <RocketLaunchIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Deploy {project?.name || 'Project'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Configure and deploy your application
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Environment Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Deployment Environment
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {environments.map((env) => (
              <button
                key={env.name}
                onClick={() => handleInputChange('environment', env.name)}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  config.environment === env.name
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <CloudIcon className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-gray-900 dark:text-white capitalize">
                    {env.name}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  {env.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {env.features.slice(0, 2).map((feature) => (
                    <span
                      key={feature}
                      className="inline-block px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          
          {selectedEnvironment && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <InformationCircleIcon className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>Deployment URL:</strong> {selectedEnvironment.url.replace('{project-name}', project?.name.toLowerCase().replace(/\s+/g, '-') || 'project')}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Features: {selectedEnvironment.features.join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Build Configuration */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Build Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Build Command
              </label>
              <input
                type="text"
                value={config.buildCommand}
                onChange={(e) => handleInputChange('buildCommand', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="npm run build"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Start Command
              </label>
              <input
                type="text"
                value={config.startCommand}
                onChange={(e) => handleInputChange('startCommand', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="npm start"
              />
            </div>
          </div>
        </div>

        {/* Environment Variables */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Environment Variables
          </h3>
          
          {/* Add new environment variable */}
          <div className="flex space-x-2 mb-3">
            <input
              type="text"
              value={envVarKey}
              onChange={(e) => setEnvVarKey(e.target.value)}
              placeholder="Variable name"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <input
              type="text"
              value={envVarValue}
              onChange={(e) => setEnvVarValue(e.target.value)}
              placeholder="Variable value"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={addEnvironmentVariable}
              disabled={!envVarKey || !envVarValue}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
          
          {/* Existing environment variables */}
          {Object.keys(config.environmentVariables).length > 0 && (
            <div className="space-y-2">
              {Object.entries(config.environmentVariables).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex-1">
                    <span className="font-medium text-gray-900 dark:text-white">{key}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">= {value}</span>
                  </div>
                  <button
                    onClick={() => removeEnvironmentVariable(key)}
                    className="text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Advanced Configuration */}
        <div className="mb-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center space-x-2 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <CogIcon className="w-5 h-5" />
            <span>Advanced Configuration</span>
          </button>
          
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-4"
              >
                {/* Auto Scaling */}
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Auto Scaling</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Automatically scale instances based on traffic
                    </div>
                  </div>
                  <button
                    onClick={() => handleInputChange('autoScale', !config.autoScale)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      config.autoScale ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config.autoScale ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {config.autoScale && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Min Instances
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={config.minInstances}
                        onChange={(e) => handleInputChange('minInstances', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Instances
                      </label>
                      <input
                        type="number"
                        min={config.minInstances}
                        value={config.maxInstances}
                        onChange={(e) => handleInputChange('maxInstances', parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
                
                {/* Health Check */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Health Check Path
                  </label>
                  <input
                    type="text"
                    value={config.healthCheckPath}
                    onChange={(e) => handleInputChange('healthCheckPath', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="/health"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Warning for Production */}
        {config.environment === 'production' && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start space-x-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-800 dark:text-yellow-300">
                  Production Deployment
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                  You are about to deploy to production. This will affect live users. Make sure you have tested your changes thoroughly.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={isDeploying || !project}
            className="inline-flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {isDeploying ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Deploying...
              </>
            ) : (
              <>
                <RocketLaunchIcon className="w-4 h-4 mr-2" />
                Deploy to {config.environment}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeploymentModal;