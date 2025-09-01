// Project State Types - Aligned with Backend OpenAPI Schema

export interface ProjectMetadata {
  name: string;
  description?: string;
  version?: string;
  createdAt: string;
  updatedAt: string;
  owner: string;
  tags?: string[];
}

export interface FrontendConfig {
  framework: 'react' | 'vue' | 'angular' | 'svelte';
  language: 'javascript' | 'typescript';
  styling: 'css' | 'scss' | 'tailwind' | 'styled-components';
  buildTool: 'vite' | 'webpack' | 'parcel';
}

export interface BackendConfig {
  runtime: 'nodejs' | 'python' | 'java' | 'go';
  framework: 'express' | 'fastify' | 'koa' | 'nestjs';
  language: 'javascript' | 'typescript' | 'python' | 'java' | 'go';
  apiStyle: 'rest' | 'graphql' | 'grpc';
}

export interface DatabaseCollection {
  name: string;
  schema: Record<string, any>;
  indexes?: Record<string, any>[];
}

export interface DatabaseSchema {
  type: 'mongodb' | 'postgresql' | 'mysql' | 'sqlite';
  collections?: DatabaseCollection[];
}

export interface InfraConfig {
  provider: 'aws' | 'gcp' | 'azure' | 'vercel' | 'railway';
  containerization?: 'docker' | 'podman';
  orchestration?: 'kubernetes' | 'docker-compose' | 'nomad';
}

export interface ProjectArchitecture {
  frontend?: FrontendConfig;
  backend?: BackendConfig;
  database?: DatabaseSchema;
  infrastructure?: InfraConfig;
}

export interface FileTree {
  [path: string]: {
    type: 'file' | 'directory';
    content?: string;
    children?: FileTree;
  };
}

export interface PackageManifest {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface TestSuite {
  framework: 'jest' | 'vitest' | 'mocha' | 'cypress';
  coverage?: {
    threshold: number;
    reports: string[];
  };
  config?: Record<string, any>;
}

export interface ProjectCodebase {
  files?: FileTree;
  dependencies?: PackageManifest;
  tests?: TestSuite;
}

export interface DeploymentHistory {
  id: string;
  environment: 'development' | 'staging' | 'production';
  status: 'pending' | 'building' | 'deploying' | 'success' | 'failed';
  url?: string;
  deployedAt: string;
  logs?: string[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ConversationThread {
  id: string;
  messages: ConversationMessage[];
  intent?: 'feature_request' | 'bug_fix' | 'deployment' | 'question' | 'optimization';
  status: 'active' | 'resolved' | 'archived';
}

// Main Project State Interface
export interface ProjectState {
  id: string;
  metadata: ProjectMetadata;
  architecture?: ProjectArchitecture;
  codebase?: ProjectCodebase;
  deployments?: DeploymentHistory[];
  conversations?: ConversationThread[];
}

// Domain Events Types
export interface DomainEvent {
  id: string;
  type: string;
  version: string;
  timestamp: string;
  aggregateId: string;
  aggregateType: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ProjectCreatedEvent extends DomainEvent {
  type: 'project.created';
  payload: {
    projectId: string;
    metadata: ProjectMetadata;
    architecture?: ProjectArchitecture;
  };
}

export interface ProjectUpdatedEvent extends DomainEvent {
  type: 'project.updated';
  payload: {
    projectId: string;
    changes: Partial<ProjectState>;
    previousVersion?: string;
  };
}

export interface ConversationStartedEvent extends DomainEvent {
  type: 'conversation.started';
  payload: {
    projectId: string;
    conversationId: string;
    intent?: string;
    initialMessage: ConversationMessage;
  };
}

export interface DeploymentInitiatedEvent extends DomainEvent {
  type: 'deployment.initiated';
  payload: {
    projectId: string;
    deploymentId: string;
    environment: string;
    triggeredBy: string;
  };
}

export interface BuildCompletedEvent extends DomainEvent {
  type: 'build.completed';
  payload: {
    projectId: string;
    buildId: string;
    status: 'success' | 'failed';
    artifacts?: string[];
    logs?: string[];
  };
}

// Event Union Type
export type ProjectDomainEvent = 
  | ProjectCreatedEvent 
  | ProjectUpdatedEvent 
  | ConversationStartedEvent 
  | DeploymentInitiatedEvent 
  | BuildCompletedEvent;

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: Record<string, any>;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}