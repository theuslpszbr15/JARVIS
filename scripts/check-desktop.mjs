import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.JARVIS_TEST_EXE;
const profile = await mkdtemp(path.join(tmpdir(), 'jarvis-test-'));
const profileArgument = `--user-data-dir=${profile}`;
const desktop = await electron.launch({ ...(executablePath ? { executablePath, args: [profileArgument] } : { args: [root, profileArgument] }), env, timeout: 60000 });
try {
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.getElementById('connection').textContent === 'Aplicativo offline');
  assert.ok(page.url().startsWith('file:///'));
  await desktop.context().setOffline(true);
  const capabilities = await page.evaluate(() => window.jarvis.status());
  assert.equal(capabilities.voice, true);
  await page.locator('#speech').uncheck();
  await page.locator('#prompt').fill('calcule 8 vezes 7');
  await page.locator('#send').click();
  await page.waitForFunction(() => !document.getElementById('send').disabled);
  assert.match(await page.locator('#messages').innerText(), /56/);
  const audio = await page.evaluate(async () => {
    const bytes = await window.jarvis.speak({ text: 'Sistemas prontos. Em que posso ajudar?', rate: .95 });
    const audioContext = new AudioContext();
    try {
      const decoded = await audioContext.decodeAudioData(new Uint8Array(bytes).buffer);
      return { length: bytes.length, duration: decoded.duration, peak: decoded.getChannelData(0).reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0) };
    } finally { await audioContext.close(); }
  });
  assert.ok(audio.length > 10000 && audio.duration > 1 && audio.peak > .01, 'Voz real deve conter audio nao silencioso');
  await page.locator('#settings-button').click();
  assert.match(await page.locator('#voice').innerText(), /Faber/);
  assert.equal(await page.locator('#install-ai').isVisible(), true);
  await page.locator('#test-voice').click();
  await page.waitForFunction(() => document.getElementById('core-state').textContent === 'FALANDO');
  await page.locator('#close-settings').click();
  await page.locator('#stop').click();
  assert.equal(await page.locator('#core-state').innerText(), 'PRONTO');
  if (!capabilities.microphone) {
    await page.locator('#mic').click();
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Baixe o microfone'));
  }
  await page.locator('#prompt').fill('Explique a gravidade');
  await page.locator('#send').click();
  await page.waitForFunction(() => !document.getElementById('send').disabled);
  if (!capabilities.ai) assert.match(await page.locator('#messages').innerText(), /IA offline ainda nao foi baixada/);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const invalidLink = await page.evaluate(() => window.jarvis.openLink('file:///C:/Windows/system.ini').then(() => false, () => true));
  assert.equal(invalidLink, true);
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'artifacts/desktop-app.png') });
  await page.locator('#settings-button').click();
  await page.screenshot({ path: path.join(root, 'artifacts/desktop-settings.png') });
  assert.deepEqual(errors, []);
  console.log(`PASS aplicativo ${executablePath ? 'empacotado' : 'desenvolvimento'}: sem HTTP, comandos offline, voz real ${audio.duration.toFixed(1)}s, ajustes, seguranca e captura de tela.`);
} finally { await desktop.close(); await rm(profile, { recursive: true, force: true, maxRetries: 3 }); }