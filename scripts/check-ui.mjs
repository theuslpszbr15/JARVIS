import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.JARVIS_TEST_URL || 'http://127.0.0.1:4317';
const output = fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const voice = { name: 'Voz de teste pt-BR', lang: 'pt-BR', voiceURI: 'test-pt-BR' };
    const synthesis = new EventTarget();
    synthesis.getVoices = () => [voice];
    synthesis.cancel = () => {};
    synthesis.speak = utterance => { window.lastSpokenText = utterance.text; queueMicrotask(() => utterance.onend?.()); };
    Object.defineProperty(window, 'speechSynthesis', { value: synthesis });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.SpeechRecognition = class {
      constructor() { window.testRecognition = this; }
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const send = async text => {
    await page.locator('#prompt').fill(text);
    await page.locator('#send').click();
    await page.waitForFunction(() => !document.getElementById('send').disabled);
  };
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    await page.goto(base);
    await page.waitForFunction(() => document.getElementById('connection').textContent === 'Sistema online');
    await send('calcule 25 vezes 4');
    assert.match(await page.locator('#messages').innerText(), /O resultado e 100/);
    assert.match(await page.evaluate(() => window.lastSpokenText), /100/);
    const canvasStats = await page.locator('#core').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let nonblank = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) nonblank += 1;
      return { nonblank, width: canvas.width };
    });
    assert.ok(canvasStats.nonblank > 1000, 'Canvas deve conter o nucleo visual');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sem transbordamento horizontal');
    await page.screenshot({ path: `${output}/jarvis-${viewport.width}.png`, fullPage: true });
    await page.locator('#settings-button').click();
    assert.equal(await page.locator('#settings').isVisible(), true);
    await page.locator('#test-voice').click();
    assert.match(await page.evaluate(() => window.lastSpokenText), /Sistemas prontos/);
    await page.screenshot({ path: `${output}/settings-${viewport.width}.png`, fullPage: true });
    await page.locator('#close-settings').click();
    await page.locator('#mic').click();
    assert.equal(await page.locator('#core-state').innerText(), 'OUVINDO');
    await page.evaluate(() => window.testRecognition.onresult({ results: [Object.assign([{ transcript: 'Que horas sao?' }], { isFinal: true })] }));
    await page.waitForFunction(() => !document.getElementById('send').disabled);
    assert.match(await page.locator('#messages').innerText(), /Agora sao/);
    await send('pesquise cafe & livros');
    assert.equal(new URL(await page.locator('#messages a').getAttribute('href')).searchParams.get('q'), 'cafe & livros');
    await send('<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#messages img').count(), 0);
    await page.route('**/api/chat', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Falha simulada de conexao' }) }));
    await send('Mensagem de teste');
    assert.match(await page.locator('#notice').innerText(), /Falha simulada/);
    assert.equal(await page.locator('#prompt').inputValue(), 'Mensagem de teste');
    await page.unroute('**/api/chat');
    await page.locator('#clear').click();
    assert.equal(await page.locator('.message').count(), 1);
    console.log(`PASS ${viewport.width}x${viewport.height}: conversa, voz simulada, microfone simulado, links, erros, canvas e layout`);
  }
  assert.deepEqual(errors, [], 'Sem erros JavaScript no navegador');
  const unsupported = await browser.newContext();
  await unsupported.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  const unsupportedPage = await unsupported.newPage();
  await unsupportedPage.goto(base);
  assert.equal(await unsupportedPage.locator('#mic').isDisabled(), true);
  console.log('PASS fallback sem reconhecimento de voz');
} finally { await browser.close(); }