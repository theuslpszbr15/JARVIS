import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { localReply } from './lib/commands.mjs';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });
const root = new URL('.', import.meta.url);
const routes = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/lucide.js', ['node_modules/lucide/dist/umd/lucide.js', 'text/javascript; charset=utf-8']]
]);

export function configuration(env = process.env) {
  const provider = env.AI_PROVIDER || 'local';
  if (!['local', 'openai', 'ollama'].includes(provider)) throw new Error('AI_PROVIDER deve ser local, openai ou ollama.');
  return {
    provider,
    model: env.AI_MODEL || (provider === 'ollama' ? 'qwen2.5:3b' : 'gpt-4o-mini'),
    apiKey: env.OPENAI_API_KEY || '',
    ollamaUrl: env.OLLAMA_URL || 'http://127.0.0.1:11434'
  };
}

async function aiReply(message, history, config) {
  if (config.provider === 'local') return { text: 'Estou no modo basico, sem uma IA conectada. Posso informar hora e data, calcular e preparar pesquisas. Para perguntas livres, conecte Ollama ou OpenAI nas configuracoes do projeto.', source: 'local' };
  if (config.provider === 'openai' && !config.apiKey) throw new Error('A chave OPENAI_API_KEY ainda nao foi configurada no arquivo .env.');
  const messages = [
    { role: 'system', content: 'Voce e JARVIS, um assistente virtual independente inspirado em interfaces de ficcao cientifica. Responda em portugues brasileiro, de forma breve, calma, precisa e com humor discreto. Nao afirme ser o personagem oficial ou a voz de um ator. Nao diga que acessou o computador, a internet ou executou acoes: voce nao possui essas ferramentas. Nao invente dados atuais. Evite markdown nas respostas porque serao lidas em voz alta.' },
    ...history.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-16).map(item => ({ role: item.role, content: item.content.slice(0, 2000) })),
    { role: 'user', content: message }
  ];
  const isOpenAI = config.provider === 'openai';
  const endpoint = isOpenAI ? 'https://api.openai.com/v1/chat/completions' : `${config.ollamaUrl.replace(/\/$/, '')}/api/chat`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(isOpenAI ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify({ model: config.model, messages, ...(isOpenAI ? { max_tokens: 500 } : { stream: false }) }),
      signal: AbortSignal.timeout(45000)
    });
  } catch {
    throw new Error(isOpenAI ? 'Nao consegui conectar a OpenAI. Confira sua conexao e tente novamente.' : 'O Ollama nao respondeu. Inicie o Ollama e confira o modelo configurado.');
  }
  if (!response.ok) throw new Error(`A IA retornou o status ${response.status}. Confira o modelo, a chave e a disponibilidade do provedor.`);
  const data = await response.json();
  const answer = isOpenAI ? data.choices?.[0]?.message?.content : data.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('A IA retornou uma resposta vazia. Tente novamente.');
  return { text: answer.slice(0, 8000), source: config.provider };
}

export function createAppServer(config = configuration()) {
  let activeRequests = 0;
  return http.createServer(async (request, response) => {
    const json = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(data));
    };
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const allowedHosts = [`127.0.0.1:${request.socket.localPort}`, `localhost:${request.socket.localPort}`];
    if (!allowedHosts.includes(request.headers.host)) return json(403, { error: 'Host nao permitido.' });
    const origin = request.headers.origin;
    if (origin && !allowedHosts.some(host => origin === `http://${host}`)) return json(403, { error: 'Origem nao permitida.' });
    const path = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'GET' && path === '/api/status') {
      return json(200, { provider: config.provider, model: config.provider === 'local' ? null : config.model, configured: config.provider !== 'openai' || Boolean(config.apiKey) });
    }
    if (request.method === 'POST' && path === '/api/chat') {
      if (!request.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Envie JSON.' });
      if (activeRequests >= 3) return json(429, { error: 'Estou ocupado. Tente novamente em instantes.' });
      activeRequests += 1;
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 65536) return json(413, { error: 'Mensagem muito grande.' });
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { return json(400, { error: 'JSON invalido.' }); }
        if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000 || (body.history !== undefined && !Array.isArray(body.history))) return json(400, { error: 'Envie uma mensagem entre 1 e 2000 caracteres e um historico valido.' });
        const message = body.message.trim();
        const local = localReply(message);
        return json(200, local ? { ...local, source: 'local' } : await aiReply(message, body.history || [], config));
      } catch (error) {
        return json(502, { error: error.message || 'Nao foi possivel processar a mensagem.' });
      } finally { activeRequests -= 1; }
    }
    if (request.method === 'GET' && routes.has(path)) {
      try {
        const [file, type] = routes.get(path);
        const content = await readFile(new URL(file, root));
        response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return response.end(content);
      } catch { return json(500, { error: 'Arquivo indisponivel. Execute npm install na pasta do projeto.' }); }
    }
    return json(404, { error: 'Rota nao encontrada.' });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`))) {
  const server = createAppServer();
  const requestedPort = Number(process.env.PORT || 4317);
  if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error('PORT deve estar entre 1024 e 65535.');
  let retried = false;
  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && !retried) {
      retried = true;
      server.listen(0, '127.0.0.1');
    } else { console.error(error.message); process.exitCode = 1; }
  });
  server.on('listening', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`JARVIS pronto: ${url}\nMantenha este terminal aberto. Ctrl+C para encerrar.`);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' });
      browser.on('error', () => console.log(`Abra ${url} no Edge ou Chrome.`));
      browser.unref();
    }
  });
  server.listen(requestedPort, '127.0.0.1');
}