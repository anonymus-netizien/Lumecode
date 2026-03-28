/**
 * LiveSync Hook (FIX 3)
 * Watches file system changes using chokidar
 * Notifies the TUI when files are added, changed, or deleted
 */

import { useEffect } from 'react';
import chokidar from 'chokidar';
import path from 'path';

// ===========================================
// Types
// ===========================================

export interface FileEvent {
  op: 'add' | 'change' | 'unlink';
  path: string;
  time: Date;
}

// ===========================================
// LiveSync Hook using chokidar
// ===========================================

export function useLiveSync(
  workdir: string,
  onEvent: (e: FileEvent) => void
): void {
  useEffect(() => {
    if (!workdir) return;

    const watcher = chokidar.watch(workdir, {
      ignored: /(node_modules|\.git|dist|\.next|bun\.lockb)(\/|$)/,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 50 },
    });

    const emit = (op: FileEvent['op']) => (abs: string) =>
      onEvent({ op, path: path.relative(workdir, abs), time: new Date() });

    watcher
      .on('add', emit('add'))
      .on('change', emit('change'))
      .on('unlink', emit('unlink'));

    return () => {
      watcher.close();
    };
  }, [workdir, onEvent]);
}

export default useLiveSync;
