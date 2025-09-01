// MongoDB initialization script for Cognify development environment

// Switch to the cognify database
db = db.getSiblingDB('cognify');

// Create a user for the application
db.createUser({
  user: 'cognify_user',
  pwd: 'cognify_password',
  roles: [
    {
      role: 'readWrite',
      db: 'cognify'
    }
  ]
});

// Create collections with validation schemas
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username', 'email', 'password'],
      properties: {
        username: {
          bsonType: 'string',
          description: 'Username must be a string and is required'
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
          description: 'Email must be a valid email address'
        },
        password: {
          bsonType: 'string',
          minLength: 6,
          description: 'Password must be at least 6 characters'
        }
      }
    }
  }
});

db.createCollection('projects', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'owner'],
      properties: {
        name: {
          bsonType: 'string',
          description: 'Project name must be a string and is required'
        },
        owner: {
          bsonType: 'objectId',
          description: 'Owner must be a valid ObjectId'
        },
        status: {
          bsonType: 'string',
          enum: ['planning', 'development', 'testing', 'deployment', 'completed', 'archived'],
          description: 'Status must be one of the predefined values'
        }
      }
    }
  }
});

db.createCollection('conversations', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['projectId', 'participants'],
      properties: {
        projectId: {
          bsonType: 'objectId',
          description: 'Project ID must be a valid ObjectId'
        },
        participants: {
          bsonType: 'array',
          items: {
            bsonType: 'objectId'
          },
          description: 'Participants must be an array of ObjectIds'
        }
      }
    }
  }
});

// Create indexes for better performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.projects.createIndex({ owner: 1 });
db.projects.createIndex({ name: 1 });
db.projects.createIndex({ 'collaborators.user': 1 });
db.conversations.createIndex({ projectId: 1 });
db.conversations.createIndex({ participants: 1 });
db.conversations.createIndex({ createdAt: -1 });

print('MongoDB initialization completed for Cognify development environment');