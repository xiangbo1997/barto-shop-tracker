import type { Page } from 'playwright';

const CHALLENGE_TITLE_KEYWORDS = ['人机验证', '前往店铺', 'verification', 'just a moment', 'attention required'];

const CONTINUE_BUTTON_TEXTS = ['前往店铺', '前往商店', '继续访问', '继续', '我已阅读', '点击进入', 'continue', 'enter shop'];

const DISMISS_BUTTON_TEXTS = ['我已阅读', '我知道了', '关闭', 'got it', 'dismiss', 'close'];

export interface ChallengeOutcome {
  detected: boolean;
  bypassed: boolean;
  steps: string[];
}

async function getTitleSafely(page: Page): Promise<string> {
  try {
    return await page.title();
  } catch {
    return '';
  }
}

async function clickByText(page: Page, candidates: string[]): Promise<string | null> {
  for (const text of candidates) {
    try {
      const locator = page.locator(`button:has-text("${text}"), a:has-text("${text}"), .button:has-text("${text}"), [role="button"]:has-text("${text}")`).first();
      const count = await locator.count();
      if (count === 0) continue;
      const visible = await locator.isVisible({ timeout: 500 }).catch(() => false);
      if (!visible) continue;
      await locator.click({ timeout: 3000 });
      return text;
    } catch {}
  }
  return null;
}

async function detectAntiKidnap(page: Page): Promise<boolean> {
  const title = await getTitleSafely(page);
  const lower = title.toLowerCase();
  if (CHALLENGE_TITLE_KEYWORDS.some((k) => lower.includes(k.toLowerCase()) || title.includes(k))) return true;

  try {
    const hasButton = await page
      .locator('text=前往店铺, text=前往商店')
      .first()
      .isVisible({ timeout: 200 })
      .catch(() => false);
    if (hasButton) return true;
  } catch {}

  return false;
}

export async function handleChallenges(page: Page): Promise<ChallengeOutcome> {
  const steps: string[] = [];
  let detected = false;
  let bypassed = false;

  if (await detectAntiKidnap(page)) {
    detected = true;
    steps.push(`detected challenge: title="${await getTitleSafely(page)}"`);

    const clicked = await clickByText(page, CONTINUE_BUTTON_TEXTS);
    if (clicked) {
      steps.push(`clicked "${clicked}"`);
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
      await page.waitForTimeout(2_500);
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);

      const newTitle = await getTitleSafely(page);
      const stillChallenge = await detectAntiKidnap(page);
      bypassed = !stillChallenge && newTitle.length > 0 && !newTitle.toLowerCase().includes('loading');
      steps.push(`after click: title="${newTitle}" bypassed=${bypassed}`);
    } else {
      steps.push('no continue button found');
    }
  }

  const dismissed = await clickByText(page, DISMISS_BUTTON_TEXTS);
  if (dismissed) {
    steps.push(`dismissed modal: "${dismissed}"`);
    await page.waitForTimeout(500);
  }

  return { detected, bypassed, steps };
}
