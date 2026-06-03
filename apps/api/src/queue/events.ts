type EventListener = (event: JobEvent) => void;

export interface JobEvent {
  type: 'job.started' | 'job.completed' | 'job.failed';
  productId: number;
  jobId: string | null;
  url: string;
  error?: string | null;
  hit?: boolean;
  at: number;
}

class JobEventBus {
  private readonly listeners = new Set<EventListener>();
  private readonly recent: JobEvent[] = [];
  private readonly recentLimit = 200;

  emit(event: JobEvent): void {
    this.recent.push(event);
    if (this.recent.length > this.recentLimit) {
      this.recent.splice(0, this.recent.length - this.recentLimit);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[events] listener error:', err);
      }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRecent(): JobEvent[] {
    return [...this.recent];
  }
}

export const jobEvents = new JobEventBus();
