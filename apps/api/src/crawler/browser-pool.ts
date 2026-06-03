import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext } from 'playwright';

chromiumExtra.use(StealthPlugin());

interface PoolEntry {
  browser: Browser;
  busy: boolean;
  createdAt: number;
  useCount: number;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class BrowserPool {
  private readonly entries: PoolEntry[] = [];
  private readonly waiters: Array<(entry: PoolEntry) => void> = [];
  private readonly recycleAfterUses = 50;

  constructor(private readonly maxSize: number) {}

  async acquire(): Promise<{ browser: Browser; release: () => void }> {
    const entry = await this.getOrCreate();
    entry.busy = true;
    entry.useCount += 1;

    const release = () => {
      entry.busy = false;
      if (entry.useCount >= this.recycleAfterUses) {
        void this.recycle(entry);
        return;
      }
      const waiter = this.waiters.shift();
      if (waiter) waiter(entry);
    };

    return { browser: entry.browser, release };
  }

  async newContext(
    browser: Browser,
    overrides: { userAgent?: string | null } = {}
  ): Promise<BrowserContext> {
    return browser.newContext({
      userAgent: overrides.userAgent ?? DEFAULT_USER_AGENT,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: true,
      bypassCSP: true,
    });
  }

  async shutdown(): Promise<void> {
    const all = [...this.entries];
    this.entries.length = 0;
    await Promise.allSettled(all.map((e) => e.browser.close()));
  }

  private async getOrCreate(): Promise<PoolEntry> {
    const idle = this.entries.find((e) => !e.busy);
    if (idle) return idle;

    if (this.entries.length < this.maxSize) {
      const browser = (await chromiumExtra.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      })) as Browser;
      const entry: PoolEntry = { browser, busy: false, createdAt: Date.now(), useCount: 0 };
      this.entries.push(entry);
      return entry;
    }

    return new Promise<PoolEntry>((resolve) => {
      this.waiters.push((entry) => resolve(entry));
    });
  }

  private async recycle(entry: PoolEntry): Promise<void> {
    const idx = this.entries.indexOf(entry);
    if (idx >= 0) this.entries.splice(idx, 1);
    await entry.browser.close().catch(() => undefined);
    const waiter = this.waiters.shift();
    if (waiter) {
      const fresh = await this.getOrCreate();
      waiter(fresh);
    }
  }
}

let globalPool: BrowserPool | null = null;

export function getBrowserPool(maxSize = 2): BrowserPool {
  if (!globalPool) globalPool = new BrowserPool(maxSize);
  return globalPool;
}

export async function shutdownBrowserPool(): Promise<void> {
  if (globalPool) {
    await globalPool.shutdown();
    globalPool = null;
  }
}
