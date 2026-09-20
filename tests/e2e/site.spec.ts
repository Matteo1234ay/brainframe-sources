import { expect, test } from '@playwright/test';

const prompts = [
  'Che cosa significa essere intelligenti?',
  'Come l’interfaccia cambia il modo in cui percepiamo l’AI?',
  'Chi paga, chi guadagna, quanto costa?',
  'Come funziona davvero?'
];

test('home communicates the four Brainframe perspectives', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Le fonti dietro i nostri video sull’AI.');
  for (const prompt of prompts) await expect(page.getByText(prompt)).toBeVisible();
  await expect(page.locator('[data-hero-path]')).toHaveCount(4);
  await expect(page.locator('[data-hero-lens]')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /Vedi le fonti/i })).toBeVisible();
});

test('demo SourcePage exposes the used source and hides empty corrections', async ({ page }) => {
  await page.goto('/fonti/demo-sourcepage/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('DEMO — Come leggiamo una fonte');
  await expect(page.getByText('00:42')).toBeVisible();
  await expect(page.getByRole('link', { name: /Attention Is All You Need/ })).toHaveAttribute('href', /arxiv\.org/);
  await expect(page.getByRole('heading', { name: /Correzioni/i })).toHaveCount(0);
});

test('search finds content by source author', async ({ page }) => {
  await page.goto('/cerca/');
  await page.getByRole('searchbox').fill('Vaswani');
  await expect(page.getByRole('link', { name: /DEMO — Come leggiamo una fonte/ })).toBeVisible();
});

test('reduced motion keeps the narrative readable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.getByText('Che cosa significa essere intelligenti?')).toBeVisible();
});

test('pages do not overflow horizontally', async ({ page }) => {
  await page.goto('/fonti/demo-sourcepage/');
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});
