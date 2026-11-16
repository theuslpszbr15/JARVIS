import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer, configuration } from '../server.mjs';

test('servidor local, validacao e arquivos publicos', async context => {
  const server = createAppServer(configuration({}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (body, headers = {}) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.provider, 'local');
  assert.equal(status.apiKey, undefined);
  assert.equal((await send({ message: '' })).status, 400);
  assert.equal((await send({ message: 'oi', history: {} })).status, 400);
  assert.equal((await send(null)).status, 400);
  assert.equal((await send({ message: 'oi' }, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await send({ message: 'calcule 2 + 3' }).then(result => result.json())).text, 'O resultado e 5.');
  assert.match((await send({ message: 'Explique fisica' }).then(result => result.json())).text, /modo basico/);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
});

test('configuracao de IA validada', () => {
  assert.throws(() => configuration({ AI_PROVIDER: 'invalid' }));
  assert.equal(configuration({ AI_PROVIDER: 'ollama' }).model, 'qwen2.5:3b');
});