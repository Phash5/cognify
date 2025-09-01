const { logger } = require('../middleware/logger');
const Project = require('../models/Project');

// AI Agent types and their capabilities
const AI_AGENTS = {
  general_agent: {
    name: 'General Assistant',
    description: 'Handles general queries and project planning',
    capabilities: ['planning', 'consultation', 'guidance', 'project_overview']
  },
  frontend_agent: {
    name: 'Frontend Developer',
    description: 'Specializes in UI/UX design and frontend development',
    capabilities: ['react', 'vue', 'angular', 'css', 'html', 'javascript', 'typescript', 'ui_design']
  },
  backend_agent: {
    name: 'Backend Developer',
    description: 'Handles server-side logic and API development',
    capabilities: ['nodejs', 'express', 'api_design', 'database_integration', 'authentication']
  },
  database_agent: {
    name: 'Database Architect',
    description: 'Designs and optimizes database schemas',
    capabilities: ['mongodb', 'postgresql', 'mysql', 'schema_design', 'optimization']
  },
  auth_agent: {
    name: 'Security Specialist',
    description: 'Implements authentication and security features',
    capabilities: ['jwt', 'oauth', 'security', 'encryption', 'authorization']
  },
  deploy_agent: {
    name: 'DevOps Engineer',
    description: 'Handles deployment and infrastructure',
    capabilities: ['docker', 'aws', 'vercel', 'ci_cd', 'monitoring']
  }
};

// Code templates for different technologies
const CODE_TEMPLATES = {
  react_component: {
    template: `import React, { useState, useEffect } from 'react';
import './{{componentName}}.css';

const {{componentName}} = ({{props}}) => {
  {{stateDeclarations}}

  {{useEffects}}

  {{eventHandlers}}

  return (
    <div className="{{className}}">
      {{jsx}}
    </div>
  );
};

export default {{componentName}};`,
    variables: ['componentName', 'props', 'stateDeclarations', 'useEffects', 'eventHandlers', 'className', 'jsx']
  },
  express_route: {
    template: `const express = require('express');
const {{modelName}} = require('../models/{{modelName}}');
const { auth{{additionalMiddleware}} } = require('../middleware/auth');
const { asyncHandler, {{errorTypes}} } = require('../middleware/errorHandler');

const router = express.Router();

{{routes}}

module.exports = router;`,
    variables: ['modelName', 'additionalMiddleware', 'errorTypes', 'routes']
  },
  mongoose_model: {
    template: `const mongoose = require('mongoose');

const {{modelName}}Schema = new mongoose.Schema({
{{fields}}
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

{{virtuals}}

{{methods}}

{{statics}}

{{indexes}}

module.exports = mongoose.model('{{modelName}}', {{modelName}}Schema);`,
    variables: ['modelName', 'fields', 'virtuals', 'methods', 'statics', 'indexes']
  }
};

// Determine the best agent for a given message
const determineAgent = (message, context) => {
  const lowerMessage = message.toLowerCase();
  
  // Keywords for different agents
  const agentKeywords = {
    frontend_agent: ['ui', 'frontend', 'react', 'vue', 'angular', 'component', 'css', 'html', 'design', 'interface'],
    backend_agent: ['backend', 'api', 'server', 'endpoint', 'route', 'express', 'nodejs'],
    database_agent: ['database', 'schema', 'model', 'mongodb', 'mysql', 'postgresql', 'query'],
    auth_agent: ['auth', 'login', 'register', 'jwt', 'security', 'password', 'token'],
    deploy_agent: ['deploy', 'deployment', 'docker', 'aws', 'vercel', 'hosting', 'ci/cd']
  };
  
  // Check for agent-specific keywords
  for (const [agent, keywords] of Object.entries(agentKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return agent;
    }
  }
  
  // Default to current active agent or general agent
  return context.activeAgent || 'general_agent';
};

// Generate code based on request
const generateCode = (request, technology, context) => {
  const { type, name, features, framework } = request;
  
  switch (type) {
    case 'component':
      if (framework === 'react') {
        return generateReactComponent(name, features);
      }
      break;
    case 'route':
      return generateExpressRoute(name, features);
    case 'model':
      return generateMongooseModel(name, features);
    default:
      return generateGenericCode(request);
  }
};

// Generate React component
const generateReactComponent = (name, features = []) => {
  const componentName = name.charAt(0).toUpperCase() + name.slice(1);
  const className = name.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase();
  
  let stateDeclarations = '';
  let useEffects = '';
  let eventHandlers = '';
  let jsx = `<h1>${componentName}</h1>`;
  
  if (features.includes('state')) {
    stateDeclarations = `const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);`;
  }
  
  if (features.includes('api')) {
    useEffects = `useEffect(() => {
    // Fetch data from API
    const fetchData = async () => {
      setLoading(true);
      try {
        // Add your API call here
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);`;
  }
  
  if (features.includes('form')) {
    eventHandlers = `const handleSubmit = (e) => {
    e.preventDefault();
    // Handle form submission
  };`;
    jsx = `<form onSubmit={handleSubmit}>
        <input type="text" placeholder="Enter text" />
        <button type="submit">Submit</button>
      </form>`;
  }
  
  return {
    filename: `${componentName}.jsx`,
    language: 'javascript',
    code: CODE_TEMPLATES.react_component.template
      .replace(/{{componentName}}/g, componentName)
      .replace(/{{props}}/g, '')
      .replace(/{{stateDeclarations}}/g, stateDeclarations)
      .replace(/{{useEffects}}/g, useEffects)
      .replace(/{{eventHandlers}}/g, eventHandlers)
      .replace(/{{className}}/g, className)
      .replace(/{{jsx}}/g, jsx)
  };
};

// Generate Express route
const generateExpressRoute = (name, features = []) => {
  const modelName = name.charAt(0).toUpperCase() + name.slice(1);
  const routeName = name.toLowerCase();
  
  let routes = `// @desc    Get all ${routeName}s
// @route   GET /api/${routeName}
// @access  Private
router.get('/', auth, asyncHandler(async (req, res) => {
  const ${routeName}s = await ${modelName}.find({ user: req.user._id });
  
  res.json({
    success: true,
    data: { ${routeName}s }
  });
}));`;
  
  if (features.includes('crud')) {
    routes += `

// @desc    Create ${routeName}
// @route   POST /api/${routeName}
// @access  Private
router.post('/', auth, asyncHandler(async (req, res) => {
  const ${routeName} = new ${modelName}({
    ...req.body,
    user: req.user._id
  });
  
  await ${routeName}.save();
  
  res.status(201).json({
    success: true,
    data: { ${routeName} }
  });
}));`;
  }
  
  return {
    filename: `${routeName}.js`,
    language: 'javascript',
    code: CODE_TEMPLATES.express_route.template
      .replace(/{{modelName}}/g, modelName)
      .replace(/{{additionalMiddleware}}/g, '')
      .replace(/{{errorTypes}}/g, 'validationError, notFoundError')
      .replace(/{{routes}}/g, routes)
  };
};

// Generate Mongoose model
const generateMongooseModel = (name, features = []) => {
  const modelName = name.charAt(0).toUpperCase() + name.slice(1);
  
  let fields = `name: {
    type: String,
    required: [true, '${modelName} name is required'],
    trim: true
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }`;
  
  if (features.includes('timestamps')) {
    fields += `,
  isActive: {
    type: Boolean,
    default: true
  }`;
  }
  
  return {
    filename: `${modelName}.js`,
    language: 'javascript',
    code: CODE_TEMPLATES.mongoose_model.template
      .replace(/{{modelName}}/g, modelName)
      .replace(/{{fields}}/g, fields)
      .replace(/{{virtuals}}/g, '')
      .replace(/{{methods}}/g, '')
      .replace(/{{statics}}/g, '')
      .replace(/{{indexes}}/g, `// Indexes for better query performance\n${modelName.toLowerCase()}Schema.index({ user: 1 });\n${modelName.toLowerCase()}Schema.index({ createdAt: -1 });`)
  };
};

// Generate generic code
const generateGenericCode = (request) => {
  return {
    filename: 'example.js',
    language: 'javascript',
    code: `// Generated code for: ${request.description || 'Custom request'}\n\n// TODO: Implement the requested functionality\nconsole.log('Hello from generated code!');`
  };
};

// Main AI service function
const generateResponse = async ({ message, chat, user, context }) => {
  try {
    logger.info('Generating AI response', {
      chatId: chat._id,
      userId: user._id,
      message: message.substring(0, 100) + '...'
    });

    // Determine the best agent for this message
    const agent = determineAgent(message, context);
    const agentInfo = AI_AGENTS[agent];

    // Analyze the message for code generation requests
    const codeRequest = analyzeCodeRequest(message);
    
    let response = {
      content: '',
      agent,
      action: 'chat',
      codeBlocks: [],
      files: [],
      suggestions: []
    };

    // Generate response based on agent type and message content
    if (codeRequest.isCodeRequest) {
      response = await handleCodeRequest(codeRequest, agent, context, chat);
    } else {
      response = await handleGeneralRequest(message, agent, context, chat);
    }

    // Add agent signature
    response.content += `\n\n*- ${agentInfo.name}*`;

    return response;

  } catch (error) {
    logger.error('AI response generation error', {
      chatId: chat._id,
      userId: user._id,
      error: error.message
    });

    return {
      content: 'I apologize, but I encountered an error while processing your request. Please try rephrasing your question or try again later.',
      agent: 'general_agent',
      action: 'error'
    };
  }
};

// Analyze if message is requesting code generation
const analyzeCodeRequest = (message) => {
  const lowerMessage = message.toLowerCase();
  
  const codeKeywords = ['create', 'generate', 'build', 'make', 'implement', 'add', 'write'];
  const typeKeywords = {
    component: ['component', 'ui', 'interface'],
    route: ['route', 'endpoint', 'api'],
    model: ['model', 'schema', 'database'],
    function: ['function', 'method', 'utility'],
    page: ['page', 'screen', 'view']
  };
  
  const isCodeRequest = codeKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (!isCodeRequest) {
    return { isCodeRequest: false };
  }
  
  // Determine what type of code is being requested
  let type = 'generic';
  for (const [codeType, keywords] of Object.entries(typeKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      type = codeType;
      break;
    }
  }
  
  // Extract name from message
  const nameMatch = message.match(/(?:create|generate|build|make)\s+(?:a\s+)?(?:new\s+)?(?:\w+\s+)?(?:called\s+|named\s+)?['"]?([\w\s]+)['"]?/i);
  const name = nameMatch ? nameMatch[1].trim().replace(/\s+/g, '') : 'Example';
  
  return {
    isCodeRequest: true,
    type,
    name,
    originalMessage: message
  };
};

// Handle code generation requests
const handleCodeRequest = async (codeRequest, agent, context, chat) => {
  const { type, name } = codeRequest;
  
  // Determine features based on context and message
  const features = [];
  if (codeRequest.originalMessage.toLowerCase().includes('state')) features.push('state');
  if (codeRequest.originalMessage.toLowerCase().includes('api')) features.push('api');
  if (codeRequest.originalMessage.toLowerCase().includes('form')) features.push('form');
  if (codeRequest.originalMessage.toLowerCase().includes('crud')) features.push('crud');
  
  // Generate code
  const codeBlock = generateCode({
    type,
    name,
    features,
    framework: context.technologies?.find(t => t.category === 'frontend')?.name || 'react'
  }, null, context);
  
  const agentInfo = AI_AGENTS[agent];
  
  return {
    content: `I'll help you create a ${type} called "${name}". Here's the generated code:\n\nThis ${type} includes the following features: ${features.length > 0 ? features.join(', ') : 'basic structure'}.`,
    agent,
    action: 'code_generation',
    codeBlocks: [codeBlock],
    files: [{
      name: codeBlock.filename,
      path: `./src/${type}s/${codeBlock.filename}`,
      type: 'created',
      content: codeBlock.code,
      language: codeBlock.language
    }],
    suggestions: [
      {
        type: 'improvement',
        message: `Consider adding error handling and loading states to make this ${type} more robust.`,
        code: '// Add try-catch blocks and loading indicators'
      },
      {
        type: 'tip',
        message: `You can customize this ${type} by modifying the props and adding more features as needed.`
      }
    ]
  };
};

// Handle general conversation requests
const handleGeneralRequest = async (message, agent, context, chat) => {
  const agentInfo = AI_AGENTS[agent];
  const lowerMessage = message.toLowerCase();
  
  // Generate contextual responses based on agent type
  let content = '';
  
  if (agent === 'general_agent') {
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      content = `I'm your AI coding assistant! I can help you with:\n\n• **Frontend Development** - React, Vue, Angular components and UI design\n• **Backend Development** - APIs, server logic, and database integration\n• **Database Design** - Schema design and optimization\n• **Authentication** - Security and user management\n• **Deployment** - CI/CD and infrastructure setup\n\nJust describe what you want to build, and I'll help you create it step by step!`;
    } else {
      content = `I understand you want to work on: "${message}"\n\nLet me help you break this down into manageable steps. Based on your request, I recommend starting with project planning and then moving to implementation.\n\nWould you like me to create a detailed project plan or start with a specific component?`;
    }
  } else {
    content = `As a ${agentInfo.name}, I specialize in ${agentInfo.description.toLowerCase()}. \n\nFor your request: "${message}"\n\nI can help you with ${agentInfo.capabilities.slice(0, 3).join(', ')} and more. What specific aspect would you like to focus on first?`;
  }
  
  return {
    content,
    agent,
    action: 'chat',
    suggestions: [
      {
        type: 'tip',
        message: 'Be specific about your requirements to get better assistance.'
      }
    ]
  };
};

module.exports = {
  generateResponse,
  AI_AGENTS,
  determineAgent
};