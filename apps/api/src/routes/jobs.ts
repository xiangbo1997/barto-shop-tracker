import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { jobEvents } from '../queue/events.ts';

export const jobsRoute = new Hono();

jobsRoute.get('/recent', (c) => c.json({ data: jobEvents.getRecent() }));

jobsRoute.get('/stream', (c) => {
  return streamSSE(c, async (stream) => {
    let counter = 0;
    let active = true;

    const unsubscribe = jobEvents.subscribe((event) => {
      if (!active) return;
      void stream.writeSSE({
        id: String(++counter),
        event: event.type,
        data: JSON.stringify(event),
      });
    });

    stream.onAbort(() => {
      active = false;
      unsubscribe();
    });

    while (active) {
      await stream.writeSSE({ event: 'heartbeat', data: String(Date.now()) });
      await stream.sleep(15_000);
    }
  });
});
