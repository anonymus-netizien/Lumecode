/**
 * Rate Limiter
 * Prevents abuse by limiting request rates
 */

// ===========================================
// Types
// ===========================================

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Strategy: sliding window or fixed window */
  strategy: 'sliding' | 'fixed';
  /** Penalty multiplier for consecutive violations */
  penaltyMultiplier?: number;
  /** Maximum penalty factor */
  maxPenalty?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Time until limit resets (ms) */
  resetIn: number;
  /** Current request count */
  count: number;
  /** Whether currently in penalty */
  inPenalty: boolean;
}

export interface RateLimitBucket {
  /** Request timestamps */
  requests: number[];
  /** Penalty factor (1 = no penalty) */
  penaltyFactor: number;
  /** Last violation time */
  lastViolation: number | null;
  /** Window start for fixed strategy */
  windowStart: number;
  /** Request count for fixed strategy */
  windowCount: number;
}

// ===========================================
// Constants
// ===========================================

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  strategy: 'sliding',
  penaltyMultiplier: 1.5,
  maxPenalty: 4,
};

// ===========================================
// Rate Limiter Class
// ===========================================

export class RateLimiter {
  private config: RateLimitConfig;
  private buckets: Map<string, RateLimitBucket> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /**
   * Check and consume a request
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        requests: [],
        penaltyFactor: 1,
        lastViolation: null,
        windowStart: now,
        windowCount: 0,
      };
      this.buckets.set(key, bucket);
    }

    // Calculate effective max requests (with penalty)
    const effectiveMax = Math.floor(this.config.maxRequests / bucket.penaltyFactor);

    if (this.config.strategy === 'sliding') {
      return this.checkSliding(key, bucket, effectiveMax, now);
    } else {
      return this.checkFixed(key, bucket, effectiveMax, now);
    }
  }

  /**
   * Check without consuming (peek)
   */
  peek(key: string): RateLimitResult {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetIn: this.config.windowMs,
        count: 0,
        inPenalty: false,
      };
    }

    const effectiveMax = Math.floor(this.config.maxRequests / bucket.penaltyFactor);

    if (this.config.strategy === 'sliding') {
      const windowStart = now - this.config.windowMs;
      const validRequests = bucket.requests.filter(t => t > windowStart);
      return {
        allowed: validRequests.length < effectiveMax,
        remaining: Math.max(0, effectiveMax - validRequests.length),
        resetIn: validRequests.length > 0 
          ? validRequests[0] + this.config.windowMs - now 
          : this.config.windowMs,
        count: validRequests.length,
        inPenalty: bucket.penaltyFactor > 1,
      };
    } else {
      if (now - bucket.windowStart >= this.config.windowMs) {
        return {
          allowed: true,
          remaining: effectiveMax,
          resetIn: this.config.windowMs,
          count: 0,
          inPenalty: bucket.penaltyFactor > 1,
        };
      }
      return {
        allowed: bucket.windowCount < effectiveMax,
        remaining: Math.max(0, effectiveMax - bucket.windowCount),
        resetIn: bucket.windowStart + this.config.windowMs - now,
        count: bucket.windowCount,
        inPenalty: bucket.penaltyFactor > 1,
      };
    }
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Get current stats for a key
   */
  getStats(key: string): {
    requests: number;
    remaining: number;
    penaltyFactor: number;
    windowMs: number;
  } {
    const bucket = this.buckets.get(key);
    const effectiveMax = bucket 
      ? Math.floor(this.config.maxRequests / bucket.penaltyFactor)
      : this.config.maxRequests;

    if (!bucket) {
      return {
        requests: 0,
        remaining: this.config.maxRequests,
        penaltyFactor: 1,
        windowMs: this.config.windowMs,
      };
    }

    const now = Date.now();
    if (this.config.strategy === 'sliding') {
      const windowStart = now - this.config.windowMs;
      const validRequests = bucket.requests.filter(t => t > windowStart);
      return {
        requests: validRequests.length,
        remaining: Math.max(0, effectiveMax - validRequests.length),
        penaltyFactor: bucket.penaltyFactor,
        windowMs: this.config.windowMs,
      };
    } else {
      return {
        requests: bucket.windowCount,
        remaining: Math.max(0, effectiveMax - bucket.windowCount),
        penaltyFactor: bucket.penaltyFactor,
        windowMs: this.config.windowMs,
      };
    }
  }

  /**
   * Update configuration
   */
  configure(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  private checkSliding(
    key: string,
    bucket: RateLimitBucket,
    effectiveMax: number,
    now: number
  ): RateLimitResult {
    // Remove old requests outside the window
    const windowStart = now - this.config.windowMs;
    bucket.requests = bucket.requests.filter(t => t > windowStart);

    // Check if allowed
    if (bucket.requests.length >= effectiveMax) {
      this.applyPenalty(bucket, now);
      return {
        allowed: false,
        remaining: 0,
        resetIn: bucket.requests[0] + this.config.windowMs - now,
        count: bucket.requests.length,
        inPenalty: bucket.penaltyFactor > 1,
      };
    }

    // Add the request
    bucket.requests.push(now);

    // Reduce penalty over time
    this.reducePenalty(bucket, now);

    return {
      allowed: true,
      remaining: effectiveMax - bucket.requests.length,
      resetIn: bucket.requests[0] + this.config.windowMs - now,
      count: bucket.requests.length,
      inPenalty: bucket.penaltyFactor > 1,
    };
  }

  private checkFixed(
    key: string,
    bucket: RateLimitBucket,
    effectiveMax: number,
    now: number
  ): RateLimitResult {
    // Check if we need to start a new window
    if (now - bucket.windowStart >= this.config.windowMs) {
      bucket.windowStart = now;
      bucket.windowCount = 0;
      this.reducePenalty(bucket, now);
    }

    // Check if allowed
    if (bucket.windowCount >= effectiveMax) {
      this.applyPenalty(bucket, now);
      return {
        allowed: false,
        remaining: 0,
        resetIn: bucket.windowStart + this.config.windowMs - now,
        count: bucket.windowCount,
        inPenalty: bucket.penaltyFactor > 1,
      };
    }

    // Increment count
    bucket.windowCount++;

    return {
      allowed: true,
      remaining: effectiveMax - bucket.windowCount,
      resetIn: bucket.windowStart + this.config.windowMs - now,
      count: bucket.windowCount,
      inPenalty: bucket.penaltyFactor > 1,
    };
  }

  private applyPenalty(bucket: RateLimitBucket, now: number): void {
    if (this.config.penaltyMultiplier && this.config.penaltyMultiplier > 1) {
      bucket.penaltyFactor = Math.min(
        bucket.penaltyFactor * this.config.penaltyMultiplier,
        this.config.maxPenalty || 4
      );
      bucket.lastViolation = now;
    }
  }

  private reducePenalty(bucket: RateLimitBucket, now: number): void {
    // Reduce penalty if no violations for 2 windows
    if (bucket.lastViolation && now - bucket.lastViolation > this.config.windowMs * 2) {
      bucket.penaltyFactor = Math.max(1, bucket.penaltyFactor / (this.config.penaltyMultiplier || 1.5));
      if (bucket.penaltyFactor < 1.1) {
        bucket.penaltyFactor = 1;
        bucket.lastViolation = null;
      }
    }
  }

  private startCleanup(): void {
    // Clean up old buckets every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = this.config.windowMs * 5;

      for (const [key, bucket] of this.buckets) {
        if (this.config.strategy === 'sliding') {
          // Remove buckets with no recent requests
          if (bucket.requests.length === 0 || 
              bucket.requests[bucket.requests.length - 1] < now - maxAge) {
            this.buckets.delete(key);
          }
        } else {
          // Remove buckets with old windows
          if (now - bucket.windowStart > maxAge) {
            this.buckets.delete(key);
          }
        }
      }
    }, 60000);
  }
}

// ===========================================
// Pre-configured Rate Limiters
// ===========================================

/** Rate limiter for API calls */
export const apiRateLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60000,
  strategy: 'sliding',
});

/** Rate limiter for tool executions */
export const toolRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60000,
  strategy: 'sliding',
  penaltyMultiplier: 2,
});

/** Rate limiter for file operations */
export const fileRateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
  strategy: 'fixed',
});

/** Rate limiter for shell commands */
export const shellRateLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: 60000,
  strategy: 'sliding',
  penaltyMultiplier: 2,
  maxPenalty: 8,
});

// ===========================================
// Convenience Functions
// ===========================================

export function checkRateLimit(limiter: RateLimiter, key: string): RateLimitResult {
  return limiter.check(key);
}

export function isRateLimited(limiter: RateLimiter, key: string): boolean {
  return !limiter.peek(key).allowed;
}
