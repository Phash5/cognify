const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Project = require('../models/Project');
const Chat = require('../models/Chat');
const connectDB = require('../config/database');

// Sample data for seeding
const sampleUsers = [
  {
    username: 'admin',
    email: 'admin@cognify.ai',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    subscription: {
      type: 'enterprise',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    },
    emailVerified: true
  },
  {
    username: 'developer',
    email: 'dev@cognify.ai',
    password: 'dev123',
    firstName: 'John',
    lastName: 'Developer',
    role: 'developer',
    subscription: {
      type: 'pro',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    },
    emailVerified: true
  },
  {
    username: 'testuser',
    email: 'user@example.com',
    password: 'user123',
    firstName: 'Jane',
    lastName: 'Smith',
    role: 'user',
    subscription: {
      type: 'free'
    },
    emailVerified: true
  }
];

const sampleProjects = [
  {
    name: 'E-commerce Platform',
    description: 'A modern e-commerce platform with AI-powered recommendations',
    status: 'in_progress',
    priority: 'high',
    category: 'web_app',
    technology: {
      frontend: {
        framework: 'react',
        styling: 'tailwind',
        language: 'typescript'
      },
      backend: {
        framework: 'express',
        language: 'javascript',
        runtime: 'nodejs'
      },
      database: {
        type: 'mongodb',
        orm: 'mongoose'
      },
      deployment: {
        platform: 'vercel',
        containerized: false
      }
    },
    features: [
      {
        name: 'User Authentication',
        description: 'Secure user registration and login system',
        status: 'completed',
        priority: 'high',
        estimatedHours: 8,
        actualHours: 6,
        assignedTo: 'auth_agent',
        completedAt: new Date()
      },
      {
        name: 'Product Catalog',
        description: 'Display and manage product listings',
        status: 'in_progress',
        priority: 'high',
        estimatedHours: 12,
        actualHours: 8,
        assignedTo: 'frontend_agent'
      },
      {
        name: 'Shopping Cart',
        description: 'Add to cart and checkout functionality',
        status: 'pending',
        priority: 'medium',
        estimatedHours: 10,
        assignedTo: 'frontend_agent'
      }
    ],
    tags: ['ecommerce', 'react', 'mongodb'],
    isPublic: false
  },
  {
    name: 'Task Management App',
    description: 'A collaborative task management application',
    status: 'planning',
    priority: 'medium',
    category: 'web_app',
    technology: {
      frontend: {
        framework: 'vue',
        styling: 'tailwind',
        language: 'typescript'
      },
      backend: {
        framework: 'express',
        language: 'typescript',
        runtime: 'nodejs'
      },
      database: {
        type: 'postgresql',
        orm: 'prisma'
      },
      deployment: {
        platform: 'heroku',
        containerized: true
      }
    },
    features: [
      {
        name: 'Project Creation',
        description: 'Create and manage projects',
        status: 'pending',
        priority: 'high',
        estimatedHours: 6,
        assignedTo: 'backend_agent'
      },
      {
        name: 'Task Assignment',
        description: 'Assign tasks to team members',
        status: 'pending',
        priority: 'medium',
        estimatedHours: 8,
        assignedTo: 'frontend_agent'
      }
    ],
    tags: ['productivity', 'vue', 'postgresql'],
    isPublic: true
  }
];

const sampleChats = [
  {
    title: 'Getting Started with E-commerce Project',
    context: {
      currentTask: 'Setting up project structure',
      activeAgent: 'general_agent',
      projectPhase: 'planning',
      technologies: [
        { name: 'React', category: 'frontend' },
        { name: 'Express', category: 'backend' },
        { name: 'MongoDB', category: 'database' }
      ]
    },
    messages: [
      {
        id: 'msg_1',
        type: 'user',
        content: 'I want to create an e-commerce platform. Can you help me get started?',
        status: 'sent'
      },
      {
        id: 'msg_2',
        type: 'ai',
        content: 'I\'d be happy to help you create an e-commerce platform! Let\'s start by setting up the project structure with React for the frontend, Express for the backend, and MongoDB for the database.',
        metadata: {
          agent: 'general_agent',
          action: 'chat',
          suggestions: [
            {
              type: 'tip',
              message: 'Consider using TypeScript for better type safety'
            }
          ]
        },
        status: 'completed'
      }
    ],
    tags: ['ecommerce', 'getting-started']
  }
];

async function initializeDatabase() {
  try {
    console.log('🚀 Initializing database...');
    
    // Connect to database
    await connectDB();
    
    // Clear existing data (optional - comment out in production)
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Project.deleteMany({});
    await Chat.deleteMany({});
    
    // Create users
    console.log('👥 Creating sample users...');
    const createdUsers = [];
    for (const userData of sampleUsers) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`✅ Created user: ${user.username}`);
    }
    
    // Create projects
    console.log('📁 Creating sample projects...');
    const createdProjects = [];
    for (let i = 0; i < sampleProjects.length; i++) {
      const projectData = {
        ...sampleProjects[i],
        owner: createdUsers[i % createdUsers.length]._id
      };
      
      const project = new Project(projectData);
      await project.save();
      createdProjects.push(project);
      console.log(`✅ Created project: ${project.name}`);
    }
    
    // Create chats
    console.log('💬 Creating sample chats...');
    for (let i = 0; i < sampleChats.length; i++) {
      const chatData = {
        ...sampleChats[i],
        user: createdUsers[i % createdUsers.length]._id,
        project: createdProjects[i % createdProjects.length]._id
      };
      
      const chat = new Chat(chatData);
      await chat.save();
      console.log(`✅ Created chat: ${chat.title}`);
    }
    
    console.log('\n🎉 Database initialization completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Users: ${createdUsers.length}`);
    console.log(`   Projects: ${createdProjects.length}`);
    console.log(`   Chats: ${sampleChats.length}`);
    
    console.log('\n🔑 Test Credentials:');
    console.log('   Admin: admin@cognify.ai / admin123');
    console.log('   Developer: dev@cognify.ai / dev123');
    console.log('   User: user@example.com / user123');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n📦 Database connection closed');
    process.exit(0);
  }
}

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;