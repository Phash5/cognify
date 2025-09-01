import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  FolderIcon,
  CogIcon,
  UserIcon,
  RocketLaunchIcon,
  ChartBarIcon,
  QuestionMarkCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

// Hooks
import { useAuthStore } from '../../store/authStore';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Chat', href: '/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Deploy', href: '/deploy', icon: RocketLaunchIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
];

const secondaryNavigation = [
  { name: 'Profile', href: '/profile', icon: UserIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
  { name: 'Help', href: '/help', icon: QuestionMarkCircleIcon },
];

const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
  const location = useLocation();
  const { user } = useAuthStore();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <motion.div
      initial={false}
      animate={{
        width: isCollapsed ? 64 : 256,
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="flex flex-col h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-sm"
    >
      {/* Logo and toggle */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <motion.div
          initial={false}
          animate={{
            opacity: isCollapsed ? 0 : 1,
            scale: isCollapsed ? 0.8 : 1,
          }}
          transition={{ duration: 0.2 }}
          className="flex items-center space-x-2"
        >
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          {!isCollapsed && (
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              Cognify
            </span>
          )}
        </motion.div>
        
        <button
          onClick={onToggle}
          className="p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRightIcon className="w-5 h-5" />
          ) : (
            <ChevronLeftIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* User info */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.username}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <span className="text-white font-medium text-sm">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          
          <motion.div
            initial={false}
            animate={{
              opacity: isCollapsed ? 0 : 1,
              x: isCollapsed ? -10 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0"
          >
            {!isCollapsed && (
              <>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user?.username}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.subscription?.plan} plan
                </p>
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <div className="space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-r-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon
                  className={`flex-shrink-0 w-5 h-5 transition-colors ${
                    active
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                  }`}
                />
                <motion.span
                  initial={false}
                  animate={{
                    opacity: isCollapsed ? 0 : 1,
                    x: isCollapsed ? -10 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                  className="ml-3"
                >
                  {!isCollapsed && item.name}
                </motion.span>
              </NavLink>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 dark:border-gray-700 my-4"></div>

        {/* Secondary navigation */}
        <div className="space-y-1">
          {secondaryNavigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon
                  className={`flex-shrink-0 w-5 h-5 transition-colors ${
                    active
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                  }`}
                />
                <motion.span
                  initial={false}
                  animate={{
                    opacity: isCollapsed ? 0 : 1,
                    x: isCollapsed ? -10 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                  className="ml-3"
                >
                  {!isCollapsed && item.name}
                </motion.span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Upgrade prompt */}
      {!isCollapsed && user?.subscription?.plan === 'free' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 border-t border-gray-200 dark:border-gray-700"
        >
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-4 text-white">
            <h3 className="text-sm font-medium mb-1">Upgrade to Pro</h3>
            <p className="text-xs opacity-90 mb-3">
              Unlock unlimited projects and advanced AI features.
            </p>
            <button className="w-full bg-white/20 hover:bg-white/30 text-white text-xs font-medium py-2 px-3 rounded-md transition-colors">
              Upgrade Now
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default Sidebar;