import { expect, test } from '@playwright/test';

const prompts = [
  'Che cosa significa?',
  'Come l’interfaccia cambia il modo in cui percepiamo l’AI?',
  'Chi paga, chi guadagna, quanto costa?',
  'Come funziona davvero?'
];

test('home communicates the four Brainframe perspectives', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Le fonti dietro i nostri video sull’AI.');
  for (const prompt of prompts) {
    await expect(page.getByRole('heading', { level: 3, name: prompt })).toBeVisible();
  }
  await expect(page.locator('[data-hero-path]')).toHaveCount(4);
  await expect(page.locator('[data-hero-lens]')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /Vedi le fonti/i })).toHaveCount(8);
  await expect(page.getByText('Tutte le 8 schede delle fonti disponibili.')).toBeVisible();
  await expect(page.getByText('Non esiste solo l\\'AI generativa', { exact: true })).toBeVisible();
  await expect(page.getByText('DEMO — Come leggiamo una fonte')).toHaveCount(0);
  await expect(page.getByText('Che cosa significa essere intelligenti?')).toHaveCount(0);
});

test('hero copy stays readable over the animated lines', async ({ page }) => {
  await page.goto('/');
  for (const selector of ['.eyebrow', '.hero-copy h1', '.disciplines']) {
    const color = await page.locator(selector).evaluate((element) => getComputedStyle(element).color);
    expect(color).toBe('rgb(255, 255, 255)');
  }
  const panelBackground = await page.locator('.hero-copy').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(panelBackground).toBe('rgba(16, 0, 47, 0.92)');
});

test('scrolling perspective section shows only white questions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.perspective > p')).toHaveCount(0);
  await expect(page.locator('.perspective h3')).toHaveCount(4);
  for (const prompt of prompts) {
    const question = page.getByRole('heading', { level: 3, name: prompt });
    await expect(question).toBeVisible();
    const color = await question.evaluate((element) => getComputedStyle(element).color);
    expect(color).toBe('rgb(255, 255, 255)');
  }
});

test('GTA 6 source page displays sources and the linked published video', async ({ page }) => {
  await page.goto('/fonti/non-esiste-solo-ai-generativa/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Non esiste solo l'AI generativa");
  await expect(page.getByText('Video pubblicato')).toBeVisible();
  await expect(page.getByRole('link', { name: /Guarda il video su YouTube/ })).toHaveAttribute('href', 'https://youtu.be/RNPwn5kSP9I');
  await expect(page.getByRole('link', { name: /The Making of Grand Theft Auto VI/ }).first()).toHaveAttribute('href', 'https://www.bloomberg.com/features/2026-grand-theft-auto-6-making-of/');
  await expect(page.getByRole('heading', { name: /Correzioni/i })).toHaveCount(0);
});

test('economy source page links to the IEA report without a fake YouTube link', async ({ page }) => {
  await page.goto('/fonti/ai-brucia-miliardi/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('L’AI brucia miliardi. Ma qualcuno si sta arricchendo.');
  await expect(page.getByRole('link', { name: /Energy and AI/ })).toHaveAttribute('href', 'https://www.iea.org/reports/energy-and-ai');
  await expect(page.getByText('Video in preparazione')).toBeVisible();
  await expect(page.getByRole('link', { name: /Guarda il video su YouTube/ })).toHaveCount(0);
});

test('search finds content by source author', async ({ page }) => {
  await page.goto('/cerca/');
  await page.getByRole('searchbox').fill('Schreier');
  await expect(page.getByRole('link', { name: /Non esiste solo l'AI generativa/ })).toBeVisible();
});

test('reduced motion keeps the narrative readable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.getByRole('heading', { level: 3, name: 'Che cosa significa?' })).toBeVisible();
});

test('pages do not overflow horizontally', async ({ page }) => {
  await page.goto('/fonti/non-esiste-solo-ai-generativa/');
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});
