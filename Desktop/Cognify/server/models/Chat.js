const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['user', 'ai', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  metadata: {
    agent: {
      type: String,
      enum: ['frontend_agent', 'backend_agent', 'database_agent', 'auth_agent', 'deploy_agent', 'general_agent'],
      default: 'general_agent'
    },
    action: {
      type: String,
      enum: ['chat', 'code_generation', 'file_creation', 'deployment', 'testing', 'optimization'],
      default: 'chat'
    },
    files: [{
      name: String,
      path: String,
      type: {
        type: String,
        enum: ['created', 'modified', 'deleted']
      },
      content: String,
      language: String
    }],
    codeBlocks: [{
      language: String,
      code: String,
      filename: String,
      description: String
    }],
    suggestions: [{
      type: {
        type: String,
        enum: ['improvement', 'alternative', 'warning', 'tip']
      },
      message: String,
      code: String
    }]
  },
  status: {
    type: String,
    enum: ['sending', 'sent', 'processing', 'completed', 'failed'],
    default: 'sent'
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['like', 'dislike', 'helpful', 'not_helpful']
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const chatSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: [200, 'Chat title cannot exceed 200 characters']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    default: null
  },
  messages: [messageSchema],
  context: {
    currentTask: {
      type: String,
      default: null
    },
    activeAgent: {
      type: String,
      enum: ['frontend_agent', 'backend_agent', 'database_agent', 'auth_agent', 'deploy_agent', 'general_agent'],
      default: 'general_agent'
    },
    projectPhase: {
      type: String,
      enum: ['planning', 'design', 'development', 'testing', 'deployment', 'maintenance'],
      default: 'planning'
    },
    technologies: [{
      name: String,
      category: {
        type: String,
        enum: ['frontend', 'backend', 'database', 'deployment', 'testing', 'other']
      }
    }],
    files: [{
      name: String,
      path: String,
      lastModified: {
        type: Date,
        default: Date.now
      }
    }],
    variables: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  settings: {
    autoSave: {
      type: Boolean,
      default: true
    },
    aiPersonality: {
      type: String,
      enum: ['professional', 'friendly', 'concise', 'detailed'],
      default: 'professional'
    },
    codeStyle: {
      type: String,
      enum: ['clean', 'commented', 'minimal', 'verbose'],
      default: 'clean'
    },
    responseLength: {
      type: String,
      enum: ['short', 'medium', 'long'],
      default: 'medium'
    }
  },
  statistics: {
    messageCount: {
      type: Number,
      default: 0
    },
    codeGenerated: {
      type: Number,
      default: 0 // Lines of code generated
    },
    filesCreated: {
      type: Number,
      default: 0
    },
    timeSpent: {
      type: Number,
      default: 0 // Minutes
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for last message
chatSchema.virtual('lastMessage').get(function() {
  return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
});

// Virtual for duration
chatSchema.virtual('duration').get(function() {
  if (this.messages.length < 2) return 0;
  const firstMessage = this.messages[0];
  const lastMessage = this.messages[this.messages.length - 1];
  return Math.round((lastMessage.timestamp - firstMessage.timestamp) / (1000 * 60)); // Minutes
});

// Pre-save middleware to update statistics
chatSchema.pre('save', function(next) {
  if (this.isModified('messages')) {
    this.statistics.messageCount = this.messages.length;
    this.statistics.lastActivity = new Date();
    
    // Count code blocks and files
    let codeLines = 0;
    let filesCreated = 0;
    
    this.messages.forEach(message => {
      if (message.metadata && message.metadata.codeBlocks) {
        message.metadata.codeBlocks.forEach(block => {
          codeLines += (block.code.match(/\n/g) || []).length + 1;
        });
      }
      
      if (message.metadata && message.metadata.files) {
        filesCreated += message.metadata.files.filter(f => f.type === 'created').length;
      }
    });
    
    this.statistics.codeGenerated = codeLines;
    this.statistics.filesCreated = filesCreated;
  }
  
  next();
});

// Method to add message
chatSchema.methods.addMessage = function(messageData) {
  const message = {
    id: require('uuid').v4(),
    ...messageData,
    timestamp: new Date()
  };
  
  this.messages.push(message);
  return this.save();
};

// Method to update message status
chatSchema.methods.updateMessageStatus = function(messageId, status) {
  const message = this.messages.id(messageId);
  if (message) {
    message.status = status;
    return this.save();
  }
  throw new Error('Message not found');
};

// Method to get messages by type
chatSchema.methods.getMessagesByType = function(type) {
  return this.messages.filter(message => message.type === type);
};

// Method to get recent messages
chatSchema.methods.getRecentMessages = function(limit = 10) {
  return this.messages.slice(-limit);
};

// Static method to find chats by user
chatSchema.statics.findByUser = function(userId, options = {}) {
  const query = { user: userId };
  
  if (options.project) {
    query.project = options.project;
  }
  
  if (options.isActive !== undefined) {
    query.isActive = options.isActive;
  }
  
  if (options.isArchived !== undefined) {
    query.isArchived = options.isArchived;
  }
  
  return this.find(query)
    .populate('user', 'username email firstName lastName avatar')
    .populate('project', 'name description status')
    .sort({ 'statistics.lastActivity': -1 })
    .limit(options.limit || 50);
};

// Static method to search chats
chatSchema.statics.searchChats = function(userId, searchTerm) {
  return this.find({
    user: userId,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { 'messages.content': { $regex: searchTerm, $options: 'i' } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } }
    ]
  })
  .populate('user', 'username email firstName lastName avatar')
  .populate('project', 'name description status')
  .sort({ 'statistics.lastActivity': -1 });
};

// Indexes for better query performance
chatSchema.index({ user: 1 });
chatSchema.index({ project: 1 });
chatSchema.index({ 'statistics.lastActivity': -1 });
chatSchema.index({ createdAt: -1 });
chatSchema.index({ tags: 1 });
chatSchema.index({ title: 'text', 'messages.content': 'text' });

module.exports = mongoose.model('Chat', chatSchema);