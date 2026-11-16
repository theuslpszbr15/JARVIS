const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { installEngine, ready, run, findFile, engineExecutable } = require('./engines.cjs');

let window;
let installing = false;
let thinking = false;
let transcribing = false;
let speechController;
let speechSerial = 0;
let voiceRoot;
let runtime;
let localReply;
let capabilities;
const pageUrl = pathToFileURL(path.join(__dirname, '../public/index.html')).href;

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, payload) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== pageUrl) throw new Error('Origem nao permitida.');
    return callback(payload);
  });
}

async function status() {
  capabilities = {
    voice: await ready('voice', voiceRoot),
    ai: await ready('ai', path.join(runtime, 'ai')),
    microphone: await ready('microphone', path.join(runtime, 'microphone'))
  };
  return { ...capabilities, provider: capabilities.ai ? 'offline' : 'local', model: capabilities.ai ? 'Qwen 2.5 1.5B' : null, configured: true };
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    ({ localReply } = await import('../lib/commands.mjs'));
    runtime = path.join(app.getPath('userData'), 'engines');
    voiceRoot = app.isPackaged ? path.join(process.resourcesPath, 'voice') : path.join(__dirname, '../runtime/voice');
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(contents === window?.webContents && contents.getURL() === pageUrl && permission === 'media'));
    session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === window?.webContents && contents.getURL() === pageUrl && permission === 'media');
    handle('status', status);
    handle('install', async kind => {
      if (!['ai', 'microphone'].includes(kind)) throw new Error('Pacote nao permitido.');
      if (installing) throw new Error('Aguarde o download atual.');
      installing = true;
      try {
        await installEngine(kind, runtime, message => { if (!window.isDestroyed()) window.webContents.send('download-progress', message); });
        return await status();
      } finally { installing = false; }
    });
    handle('chat', async body => {
      if (!body || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000 || !Array.isArray(body.history)) throw new Error('Mensagem invalida.');
      const result = localReply(body.message);
      if (result) return { ...result, source: 'local' };
      if (!capabilities?.ai) return { text: 'A IA offline ainda nao foi baixada. Abra os ajustes e selecione Baixar IA. Os comandos de hora, data e contas ja funcionam sem internet.', source: 'local' };
      if (thinking) throw new Error('Aguarde a resposta atual.');
      thinking = true;
      try {
        const directory = path.join(runtime, 'ai');
        const executable = await findFile(directory, 'llama-cli.exe');
        const clean = text => text.replace(/<\|[^>]*\|>/g, '').slice(0, 2000);
        const messages = body.history.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').slice(-4);
        const prompt = '<|im_start|>system\nVoce e JARVIS, um assistente pessoal independente. Responda em portugues brasileiro de forma curta, educada e precisa. Nao finja acesso a internet ou ao computador. Nao use markdown.\n<|im_end|>\n' + messages.map(item => `<|im_start|>${item.role}\n${clean(item.content)}<|im_end|>\n`).join('') + `<|im_start|>user\n${clean(body.message)}<|im_end|>\n<|im_start|>assistant\n`;
        const promptFile = path.join(app.getPath('temp'), `jarvis-prompt-${process.pid}.txt`);
        await fs.writeFile(promptFile, prompt, 'utf8');
        try {
          const output = await run(executable, ['-m', path.join(directory, 'model.gguf'), '-f', promptFile, '-n', '220', '-c', '4096', '-t', '4', '-ngl', '0', '-no-cnv', '--no-display-prompt', '--log-disable', '--no-warmup', '-r', '<|im_end|>']);
          const text = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/<\|[^>]*\|>/g, '').trim();
          if (!text) throw new Error('A IA nao retornou uma resposta.');
          return { text, source: 'offline' };
        } finally { await fs.rm(promptFile, { force: true }); }
      } finally { thinking = false; }
    });
    handle('stop-speech', () => { speechController?.abort(); });
    handle('speak', async body => {
      if (!body || typeof body.text !== 'string' || body.text.length > 8000) throw new Error('Texto de voz invalido.');
      if (!capabilities?.voice) throw new Error('Motor de voz nao encontrado.');
      speechController?.abort();
      const controller = new AbortController();
      speechController = controller;
      const wave = path.join(app.getPath('temp'), `jarvis-voice-${process.pid}-${++speechSerial}.wav`);
      try {
        const executable = await findFile(voiceRoot, 'piper.exe');
        const rate = Math.min(1.4, Math.max(.6, Number(body.rate) || .95));
        await run(executable, ['--model', path.join(voiceRoot, 'voice.onnx'), '--output_file', wave, '--length_scale', String(1 / rate)], { input: `${body.text}\n`, signal: controller.signal });
        return new Uint8Array(await fs.readFile(wave));
      } finally { await fs.rm(wave, { force: true }); }
    });
    handle('transcribe', async audio => {
      if (!(audio instanceof Uint8Array) || audio.length < 44 || audio.length > 2000000 || Buffer.from(audio.subarray(0, 4)).toString() !== 'RIFF') throw new Error('Audio invalido.');
      if (!capabilities?.microphone) throw new Error('Baixe o microfone offline nos ajustes.');
      if (transcribing) throw new Error('Aguarde a transcricao atual.');
      transcribing = true;
      const wave = path.join(app.getPath('temp'), `jarvis-mic-${process.pid}.wav`);
      try {
        await fs.writeFile(wave, audio);
        const directory = path.join(runtime, 'microphone');
        const executable = await engineExecutable('microphone', directory);
        await run(executable, ['-m', path.join(directory, 'model.bin'), '-f', wave, '-l', 'pt', '-nt', '-otxt', '-of', wave, '-t', '4']);
        return (await fs.readFile(`${wave}.txt`, 'utf8')).trim();
      } finally {
        transcribing = false;
        await fs.rm(wave, { force: true });
        await fs.rm(`${wave}.txt`, { force: true });
      }
    });
    handle('open-link', async url => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !['www.google.com', 'www.youtube.com'].includes(parsed.hostname)) throw new Error('Link nao permitido.');
      await shell.openExternal(parsed.href);
    });
    await status();
    window = new BrowserWindow({ width: 1180, height: 850, minWidth: 780, minHeight: 620, backgroundColor: '#171c1c', title: 'JARVIS', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    await window.loadFile(path.join(__dirname, '../public/index.html'));
  }).catch(error => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => { speechController?.abort(); app.quit(); });
}