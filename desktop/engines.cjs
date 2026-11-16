const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createWriteStream } = require('node:fs');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const packages = {
  voice: {
    archive: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    executable: 'piper.exe',
    files: [
      ['https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx', 'voice.onnx'],
      ['https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json', 'voice.onnx.json'],
      ['https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium/MODEL_CARD', 'MODEL_CARD.md']
    ]
  },
  ai: {
    archive: 'https://github.com/ggml-org/llama.cpp/releases/download/b10819/llama-b10819-bin-win-cpu-x64.zip',
    executable: 'llama-cli.exe',
    files: [['https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf', 'model.gguf']]
  },
  microphone: {
    archive: 'https://github.com/ggml-org/whisper.cpp/releases/download/b4938/whisper-bin-x64.zip',
    executable: 'whisper-cli.exe',
    files: [['https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin', 'model.bin']]
  }
};

async function findFile(directory, name) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return fullPath;
    if (entry.isDirectory()) {
      const found = await findFile(fullPath, name);
      if (found) return found;
    }
  }
  return null;
}

function run(executable, args, { input, timeout = 120000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, cwd: path.dirname(executable), signal });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-100000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve(stdout);
      else reject(new Error(timedOut ? 'O motor local demorou demais. Tente uma mensagem menor.' : `Falha no motor local (${code}): ${stderr.slice(-800)}`));
    });
    child.stdin.end(input || '');
  });
}

async function download(url, destination, progress) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1800000) });
  if (!response.ok || !response.body) throw new Error(`Download indisponivel (${response.status}). Tente novamente mais tarde.`);
  const total = Number(response.headers.get('content-length'));
  let received = 0;
  let lastUpdate = 0;
  const meter = new Transform({ transform(chunk, encoding, callback) {
    received += chunk.length;
    if (Date.now() - lastUpdate > 500) {
      lastUpdate = Date.now();
      progress(`${path.basename(destination)}: ${Math.round(received / 1048576)} MB${total ? ` / ${Math.round(total / 1048576)} MB` : ''}`);
    }
    callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), meter, createWriteStream(destination));
  if (total && received !== total) throw new Error('Download incompleto. Tente novamente.');
}

async function installEngine(kind, root, progress = () => {}) {
  const config = packages[kind];
  if (!config) throw new Error('Motor desconhecido.');
  const target = path.join(root, kind);
  if (await ready(kind, target)) return target;
  const staging = `${target}.download`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  try {
    const archive = path.join(staging, 'engine.zip');
    await download(config.archive, archive, progress);
    progress('Extraindo motor local...');
    const quote = value => `'${value.replace(/'/g, "''")}'`;
    const command = `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(path.join(staging, 'bin'))} -Force`;
    await run(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', command]);
    await fs.rm(archive);
    if (!await engineExecutable(kind, staging)) throw new Error(`Executavel ${config.executable} ausente no pacote.`);
    for (const [url, filename] of config.files) await download(url, path.join(staging, filename), progress);
    await fs.writeFile(path.join(staging, 'ready.json'), JSON.stringify({ kind, source: config.archive }));
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(staging, target);
    progress('Instalado.');
    return target;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function ready(kind, directory) {
  try {
    await fs.access(path.join(directory, 'ready.json'));
    for (const [, filename] of packages[kind].files) await fs.access(path.join(directory, filename));
    return Boolean(await engineExecutable(kind, directory));
  } catch { return false; }
}

async function engineExecutable(kind, directory) {
  return await findFile(directory, packages[kind].executable) || (kind === 'microphone' ? await findFile(directory, 'main.exe') : null);
}

module.exports = { installEngine, ready, run, findFile, engineExecutable };