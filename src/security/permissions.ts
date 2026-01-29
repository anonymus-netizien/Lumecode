/**
 * Permission System
 * Manages permissions for tools, files, and operations
 */

// ===========================================
// Types
// ===========================================

export type Permission = 
  | 'file:read'
  | 'file:write'
  | 'file:delete'
  | 'file:execute'
  | 'directory:read'
  | 'directory:write'
  | 'directory:delete'
  | 'shell:execute'
  | 'shell:background'
  | 'network:request'
  | 'network:listen'
  | 'git:read'
  | 'git:write'
  | 'git:push'
  | 'system:read'
  | 'system:write'
  | 'mcp:connect'
  | 'mcp:tool';

export interface PermissionRequest {
  /** The permission being requested */
  permission: Permission;
  /** Resource being accessed (file path, URL, etc.) */
  resource: string;
  /** Reason for the request */
  reason?: string;
  /** Tool making the request */
  tool?: string;
  /** Whether this is a one-time or persistent grant */
  persistent?: boolean;
}

export interface PermissionGrant {
  /** The granted permission */
  permission: Permission;
  /** Resource pattern (supports wildcards) */
  resourcePattern: string;
  /** When the grant was created */
  grantedAt: Date;
  /** When the grant expires (null = never) */
  expiresAt: Date | null;
  /** Who/what granted this permission */
  grantedBy: string;
  /** Whether grant is persistent across sessions */
  persistent: boolean;
}

export interface PermissionCheckResult {
  /** Whether permission is granted */
  granted: boolean;
  /** The matching grant if found */
  matchingGrant?: PermissionGrant;
  /** Reason for denial if not granted */
  reason?: string;
}

export interface PermissionPolicy {
  /** Default policy: allow or deny */
  defaultPolicy: 'allow' | 'deny';
  /** Permissions that are always allowed */
  alwaysAllow: Permission[];
  /** Permissions that are always denied */
  alwaysDeny: Permission[];
  /** Whether to prompt user for unknown permissions */
  promptForUnknown: boolean;
  /** Auto-approve permissions for paths within workspace */
  autoApproveWorkspace: boolean;
}

// ===========================================
// Constants
// ===========================================

/** Default permission policy */
const DEFAULT_POLICY: PermissionPolicy = {
  defaultPolicy: 'deny',
  alwaysAllow: [
    'file:read',
    'directory:read',
    'git:read',
  ],
  alwaysDeny: [
    'system:write',
    'network:listen',
  ],
  promptForUnknown: true,
  autoApproveWorkspace: true,
};

/** Permission descriptions for user display */
const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'file:read': 'Read file contents',
  'file:write': 'Write or modify files',
  'file:delete': 'Delete files',
  'file:execute': 'Execute files',
  'directory:read': 'List directory contents',
  'directory:write': 'Create directories',
  'directory:delete': 'Delete directories',
  'shell:execute': 'Execute shell commands',
  'shell:background': 'Run background processes',
  'network:request': 'Make network requests',
  'network:listen': 'Listen on network ports',
  'git:read': 'Read Git repository state',
  'git:write': 'Modify Git repository',
  'git:push': 'Push to remote repositories',
  'system:read': 'Read system information',
  'system:write': 'Modify system settings',
  'mcp:connect': 'Connect to MCP servers',
  'mcp:tool': 'Use MCP tools',
};

/** Risk levels for permissions */
const PERMISSION_RISK_LEVELS: Record<Permission, 'low' | 'medium' | 'high'> = {
  'file:read': 'low',
  'file:write': 'medium',
  'file:delete': 'high',
  'file:execute': 'high',
  'directory:read': 'low',
  'directory:write': 'medium',
  'directory:delete': 'high',
  'shell:execute': 'high',
  'shell:background': 'high',
  'network:request': 'medium',
  'network:listen': 'high',
  'git:read': 'low',
  'git:write': 'medium',
  'git:push': 'high',
  'system:read': 'medium',
  'system:write': 'high',
  'mcp:connect': 'medium',
  'mcp:tool': 'medium',
};

// ===========================================
// Permission Manager Class
// ===========================================

export class PermissionManager {
  private grants: Map<string, PermissionGrant> = new Map();
  private policy: PermissionPolicy;
  private workspacePath: string;
  private promptCallback?: (request: PermissionRequest) => Promise<boolean>;
  private auditLog: Array<{
    timestamp: Date;
    request: PermissionRequest;
    result: PermissionCheckResult;
  }> = [];

  constructor(workspacePath: string, policy: Partial<PermissionPolicy> = {}) {
    this.workspacePath = workspacePath;
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Check if a permission is granted
   */
  check(request: PermissionRequest): PermissionCheckResult {
    // Check always deny
    if (this.policy.alwaysDeny.includes(request.permission)) {
      const result = {
        granted: false,
        reason: `Permission '${request.permission}' is always denied by policy`,
      };
      this.logAudit(request, result);
      return result;
    }

    // Check always allow
    if (this.policy.alwaysAllow.includes(request.permission)) {
      const result = { granted: true };
      this.logAudit(request, result);
      return result;
    }

    // Check if resource is within workspace (auto-approve if enabled)
    if (this.policy.autoApproveWorkspace && this.isWithinWorkspace(request.resource)) {
      // Auto-approve read operations within workspace
      if (request.permission.endsWith(':read')) {
        const result = { granted: true };
        this.logAudit(request, result);
        return result;
      }
      // Auto-approve write operations for certain file types
      if (request.permission === 'file:write') {
        const result = { granted: true };
        this.logAudit(request, result);
        return result;
      }
    }

    // Check explicit grants
    const grant = this.findMatchingGrant(request);
    if (grant) {
      // Check if grant has expired
      if (grant.expiresAt && grant.expiresAt < new Date()) {
        this.revokeGrant(this.getGrantKey(grant.permission, grant.resourcePattern));
      } else {
        const result = { granted: true, matchingGrant: grant };
        this.logAudit(request, result);
        return result;
      }
    }

    // Apply default policy
    const result = {
      granted: this.policy.defaultPolicy === 'allow',
      reason: this.policy.defaultPolicy === 'deny' 
        ? 'No matching permission grant found' 
        : undefined,
    };
    this.logAudit(request, result);
    return result;
  }

  /**
   * Request permission (with optional user prompt)
   */
  async request(request: PermissionRequest): Promise<PermissionCheckResult> {
    // First check existing permissions
    const checkResult = this.check(request);
    if (checkResult.granted) {
      return checkResult;
    }

    // If prompting is enabled and we have a callback, prompt the user
    if (this.policy.promptForUnknown && this.promptCallback) {
      const approved = await this.promptCallback(request);
      if (approved) {
        // Grant the permission
        this.grant({
          permission: request.permission,
          resourcePattern: request.resource,
          grantedAt: new Date(),
          expiresAt: request.persistent ? null : new Date(Date.now() + 3600000), // 1 hour
          grantedBy: 'user',
          persistent: request.persistent ?? false,
        });

        return { granted: true };
      }
    }

    return checkResult;
  }

  /**
   * Grant a permission
   */
  grant(grant: PermissionGrant): void {
    const key = this.getGrantKey(grant.permission, grant.resourcePattern);
    this.grants.set(key, grant);
  }

  /**
   * Revoke a permission grant
   */
  revoke(permission: Permission, resourcePattern: string): boolean {
    const key = this.getGrantKey(permission, resourcePattern);
    return this.grants.delete(key);
  }

  /**
   * Revoke all permissions for a resource
   */
  revokeAllForResource(resourcePattern: string): number {
    let count = 0;
    for (const [key, grant] of this.grants) {
      if (grant.resourcePattern === resourcePattern) {
        this.grants.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Revoke all permissions
   */
  revokeAll(): void {
    this.grants.clear();
  }

  /**
   * List all current grants
   */
  listGrants(): PermissionGrant[] {
    return Array.from(this.grants.values());
  }

  /**
   * Set the user prompt callback
   */
  setPromptCallback(callback: (request: PermissionRequest) => Promise<boolean>): void {
    this.promptCallback = callback;
  }

  /**
   * Update policy
   */
  setPolicy(policy: Partial<PermissionPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  /**
   * Get current policy
   */
  getPolicy(): PermissionPolicy {
    return { ...this.policy };
  }

  /**
   * Get permission description
   */
  getPermissionDescription(permission: Permission): string {
    return PERMISSION_DESCRIPTIONS[permission] || permission;
  }

  /**
   * Get permission risk level
   */
  getPermissionRiskLevel(permission: Permission): 'low' | 'medium' | 'high' {
    return PERMISSION_RISK_LEVELS[permission] || 'medium';
  }

  /**
   * Get audit log
   */
  getAuditLog(): Array<{
    timestamp: Date;
    request: PermissionRequest;
    result: PermissionCheckResult;
  }> {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Export grants to JSON
   */
  exportGrants(): string {
    const grants = this.listGrants().filter(g => g.persistent);
    return JSON.stringify(grants, null, 2);
  }

  /**
   * Import grants from JSON
   */
  importGrants(json: string): number {
    try {
      const grants = JSON.parse(json) as PermissionGrant[];
      let count = 0;
      for (const grant of grants) {
        // Restore dates
        grant.grantedAt = new Date(grant.grantedAt);
        if (grant.expiresAt) {
          grant.expiresAt = new Date(grant.expiresAt);
        }
        this.grant(grant);
        count++;
      }
      return count;
    } catch {
      return 0;
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  private getGrantKey(permission: Permission, resourcePattern: string): string {
    return `${permission}:${resourcePattern}`;
  }

  private revokeGrant(key: string): void {
    this.grants.delete(key);
  }

  private findMatchingGrant(request: PermissionRequest): PermissionGrant | undefined {
    for (const grant of this.grants.values()) {
      if (grant.permission !== request.permission) continue;
      if (this.matchesPattern(request.resource, grant.resourcePattern)) {
        return grant;
      }
    }
    return undefined;
  }

  private matchesPattern(resource: string, pattern: string): boolean {
    // Exact match
    if (resource === pattern) return true;

    // Wildcard matching
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\*/g, '.*') // Convert * to .*
        .replace(/\?/g, '.'); // Convert ? to .
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(resource);
    }

    // Directory prefix matching (pattern ends with /)
    if (pattern.endsWith('/')) {
      return resource.startsWith(pattern) || resource === pattern.slice(0, -1);
    }

    return false;
  }

  private isWithinWorkspace(resource: string): boolean {
    // Simple check - resource starts with workspace path
    const normalizedResource = resource.replace(/\\/g, '/');
    const normalizedWorkspace = this.workspacePath.replace(/\\/g, '/');
    return normalizedResource.startsWith(normalizedWorkspace);
  }

  private logAudit(request: PermissionRequest, result: PermissionCheckResult): void {
    this.auditLog.push({
      timestamp: new Date(),
      request,
      result,
    });

    // Limit audit log size
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }
}

// ===========================================
// Singleton & Convenience Functions
// ===========================================

let defaultManager: PermissionManager | null = null;

export function initPermissionManager(
  workspacePath: string,
  policy?: Partial<PermissionPolicy>
): PermissionManager {
  defaultManager = new PermissionManager(workspacePath, policy);
  return defaultManager;
}

export function getPermissionManager(): PermissionManager {
  if (!defaultManager) {
    throw new Error('Permission manager not initialized. Call initPermissionManager first.');
  }
  return defaultManager;
}

export function checkPermission(request: PermissionRequest): PermissionCheckResult {
  return getPermissionManager().check(request);
}

export async function requestPermission(request: PermissionRequest): Promise<PermissionCheckResult> {
  return getPermissionManager().request(request);
}

export function grantPermission(grant: PermissionGrant): void {
  getPermissionManager().grant(grant);
}

export function revokePermission(permission: Permission, resourcePattern: string): boolean {
  return getPermissionManager().revoke(permission, resourcePattern);
}
