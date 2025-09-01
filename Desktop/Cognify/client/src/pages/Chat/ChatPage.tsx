import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PaperAirplaneIcon,
  PlusIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  SparklesIcon,
  CodeBracketIcon,
  UserIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Hooks
import { useAuthStore } from '../../store/authStore';

interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  agent?: string;
  metadata?: {
    codeBlocks?: Array<{
      language: string;
      code: string;
      filename?: string;
    }>;
    suggestions?: string[];
    files?: string[];
  };
}

interface AIAgent {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: string[];
  color: string;
}

const aiAgents: AIAgent[] = [
  {
    id: 'general',
    name: 'General Assistant',
    description: 'General coding help and guidance',
    icon: '🤖',
    capabilities: ['Code review', 'Bug fixing', 'Best practices', 'Architecture advice'],
    color: 'from-blue-500 to-purple-600',
  },
  {
    id: 'frontend',
    name: 'Frontend Specialist',
    description: 'React, Vue, Angular, and UI/UX',
    icon: '🎨',
    capabilities: ['React components', 'CSS styling', 'Responsive design', 'State management'],
    color: 'from-pink-500 to-rose-600',
  },
  {
    id: 'backend',
    name: 'Backend Expert',
    description: 'APIs, databases, and server logic',
    icon: '⚙️',
    capabilities: ['REST APIs', 'Database design', 'Authentication', 'Performance optimization'],
    color: 'from-green-500 to-emerald-600',
  },
  {
    id: 'database',
    name: 'Database Architect',
    description: 'Database design and optimization',
    icon: '🗄️',
    capabilities: ['Schema design', 'Query optimization', 'Migrations', 'Data modeling'],
    color: 'from-orange-500 to-amber-600',
  },
  {
    id: 'deploy',
    name: 'DevOps Engineer',
    description: 'Deployment and infrastructure',
    icon: '🚀',
    capabilities: ['CI/CD', 'Docker', 'Cloud deployment', 'Monitoring'],
    color: 'from-purple-500 to-indigo-600',
  },
];

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(aiAgents[0]);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    // Add welcome message
    setMessages([
      {
        id: '1',
        type: 'system',
        content: `Welcome to Cognify! I'm your AI coding assistant. I can help you build applications, write code, debug issues, and much more. What would you like to create today?`,
        timestamp: new Date(),
        agent: selectedAgent.name,
      },
    ]);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: generateAIResponse(inputMessage, selectedAgent),
        timestamp: new Date(),
        agent: selectedAgent.name,
        metadata: {
          codeBlocks: inputMessage.toLowerCase().includes('code') || inputMessage.toLowerCase().includes('component') ? [
            {
              language: 'typescript',
              code: generateSampleCode(inputMessage),
              filename: 'example.tsx',
            },
          ] : undefined,
          suggestions: [
            'Add error handling',
            'Implement loading states',
            'Add unit tests',
            'Optimize performance',
          ],
        },
      };

      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1000 + Math.random() * 2000);
  };

  const generateAIResponse = (input: string, agent: AIAgent): string => {
    const responses = {
      general: `I'll help you with that! As your general coding assistant, I can provide guidance on best practices, code review, and architecture decisions.`,
      frontend: `Great! I'm specialized in frontend development. I can help you create beautiful, responsive user interfaces using React, Vue, or Angular.`,
      backend: `Perfect! I'm your backend expert. I can assist with API development, database integration, authentication, and server-side logic.`,
      database: `Excellent! I specialize in database design and optimization. I can help you create efficient schemas, write optimized queries, and manage data relationships.`,
      deploy: `Awesome! I'm your DevOps specialist. I can help you set up CI/CD pipelines, containerize your applications, and deploy to various cloud platforms.`,
    };

    return responses[agent.id as keyof typeof responses] || responses.general;
  };

  const generateSampleCode = (input: string): string => {
    if (input.toLowerCase().includes('component')) {
      return `import React, { useState } from 'react';

interface Props {
  title: string;
  onSubmit: (data: string) => void;
}

const ExampleComponent: React.FC<Props> = ({ title, onSubmit }) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full p-2 border rounded"
          placeholder="Enter value..."
        />
        <button
          type="submit"
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Submit
        </button>
      </form>
    </div>
  );
};

export default ExampleComponent;`;
    }

    return `// Example code based on your request
const example = {
  message: "This is a sample code block",
  timestamp: new Date(),
  isActive: true
};

console.log(example);`;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      toast.success('Code copied to clipboard!');
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (error) {
      toast.error('Failed to copy code');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        type: 'system',
        content: `New chat started with ${selectedAgent.name}. How can I help you today?`,
        timestamp: new Date(),
        agent: selectedAgent.name,
      },
    ]);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Chat</h2>
            <button
              onClick={startNewChat}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="New Chat"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
          </div>
          
          {/* Agent Selector */}
          <div className="relative">
            <button
              onClick={() => setShowAgentSelector(!showAgentSelector)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 bg-gradient-to-r ${selectedAgent.color} rounded-full flex items-center justify-center text-white text-sm`}>
                  {selectedAgent.icon}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedAgent.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selectedAgent.description}</p>
                </div>
              </div>
              <Cog6ToothIcon className="w-4 h-4 text-gray-400" />
            </button>

            <AnimatePresence>
              {showAgentSelector && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10 max-h-80 overflow-y-auto"
                >
                  {aiAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => {
                        setSelectedAgent(agent);
                        setShowAgentSelector(false);
                      }}
                      className={`w-full flex items-center space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        selectedAgent.id === agent.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 bg-gradient-to-r ${agent.color} rounded-full flex items-center justify-center text-white text-sm`}>
                        {agent.icon}
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{agent.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{agent.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.capabilities.slice(0, 2).map((capability) => (
                            <span
                              key={capability}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"
                            >
                              {capability}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Recent Chats</h3>
          <div className="space-y-2">
            {['Frontend Component Design', 'API Authentication Setup', 'Database Schema Review'].map((title, index) => (
              <button
                key={index}
                className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{index + 1} hour{index !== 0 ? 's' : ''} ago</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 bg-gradient-to-r ${selectedAgent.color} rounded-full flex items-center justify-center text-white`}>
              {selectedAgent.icon}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedAgent.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedAgent.description}</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-3xl ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                  <div className="flex items-start space-x-3">
                    {message.type !== 'user' && (
                      <div className={`w-8 h-8 bg-gradient-to-r ${selectedAgent.color} rounded-full flex items-center justify-center text-white text-sm flex-shrink-0`}>
                        {message.type === 'system' ? <SparklesIcon className="w-4 h-4" /> : selectedAgent.icon}
                      </div>
                    )}
                    
                    <div className={`rounded-lg p-4 ${
                      message.type === 'user'
                        ? 'bg-blue-500 text-white'
                        : message.type === 'system'
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      
                      {message.metadata?.codeBlocks && (
                        <div className="mt-4 space-y-3">
                          {message.metadata.codeBlocks.map((block, index) => (
                            <div key={index} className="bg-gray-900 dark:bg-gray-950 rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
                                <div className="flex items-center space-x-2">
                                  <CodeBracketIcon className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm text-gray-300">{block.filename || `${block.language} code`}</span>
                                </div>
                                <button
                                  onClick={() => copyToClipboard(block.code)}
                                  className="flex items-center space-x-1 px-2 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
                                >
                                  {copiedCode === block.code ? (
                                    <CheckIcon className="w-3 h-3" />
                                  ) : (
                                    <DocumentDuplicateIcon className="w-3 h-3" />
                                  )}
                                  <span>{copiedCode === block.code ? 'Copied' : 'Copy'}</span>
                                </button>
                              </div>
                              <pre className="p-4 text-sm text-gray-300 overflow-x-auto">
                                <code>{block.code}</code>
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {message.metadata?.suggestions && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Suggestions:</p>
                          <div className="flex flex-wrap gap-2">
                            {message.metadata.suggestions.map((suggestion, index) => (
                              <button
                                key={index}
                                className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {message.timestamp.toLocaleTimeString()}
                        </span>
                        {message.agent && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {message.agent}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {message.type === 'user' && (
                      <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <UserIcon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="flex items-start space-x-3">
                <div className={`w-8 h-8 bg-gradient-to-r ${selectedAgent.color} rounded-full flex items-center justify-center text-white text-sm`}>
                  {selectedAgent.icon}
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={`Ask ${selectedAgent.name} anything...`}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span>{inputMessage.length}/2000</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;