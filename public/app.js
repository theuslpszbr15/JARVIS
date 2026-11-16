const byId = id => document.getElementById(id);
const native = window.jarvis;
const synth = native ? null : window.speechSynthesis;
const Recognition = native ? window.DesktopRecognition : window.SpeechRecognition || window.webkitSpeechRecognition;
const history = [];
let voices = [];
let busy = false;
let listening = false;
let speaking = false;
let recognition;
let speechGeneration = 0;
let speechQueue = [];
let nativeAudio;
let nativeAudioUrl;
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem('jarvis-voice') || '{}') || {}; } catch {}
lucide.createIcons();

function notice(text = '') { byId('notice').textContent = text; }
function savePreferences() {
  preferences = { voice: byId('voice').value, rate: byId('rate').value, pitch: byId('pitch').value, speech: byId('speech').checked };
  try { localStorage.setItem('jarvis-voice', JSON.stringify(preferences)); } catch {}
}
for (const field of ['rate', 'pitch']) {
  if (Number.isFinite(Number(preferences[field]))) byId(field).value = preferences[field];
  byId(`${field}-value`).textContent = byId(field).value;
  byId(field).addEventListener('input', () => { byId(`${field}-value`).textContent = byId(field).value; savePreferences(); });
}
byId('speech').checked = preferences.speech !== false;
function updateState() {
  byId('presence-status').textContent = listening ? 'Estou ouvindo.' : busy ? 'Um instante.' : speaking ? 'Com voce.' : 'A disposicao.';
  byId('core-state').textContent = listening ? 'OUVINDO' : busy ? 'PROCESSANDO' : speaking ? 'FALANDO' : 'PRONTO';
  byId('mic-status').textContent = listening ? 'Ouvindo...' : Recognition ? 'Microfone desligado' : 'Microfone indisponivel';
  byId('mic').setAttribute('aria-pressed', String(listening));
  byId('mic').setAttribute('aria-label', listening ? 'Parar microfone' : 'Iniciar microfone');
  byId('mic').title = listening ? 'Parar microfone' : 'Iniciar microfone';
  byId('mic').disabled = !Recognition || busy;
  byId('send').disabled = busy;
  byId('clear').disabled = busy;
  byId('test-voice').disabled = busy || (!synth && !native) || !voices.length;
  byId('stop').disabled = !speaking;
  byId('activity').textContent = busy ? 'Processando mensagem...' : 'Pronto para receber';
  document.querySelectorAll('[data-prompt]').forEach(button => { button.disabled = busy; });
}
function stopSpeech() {
  speechGeneration += 1;
  speechQueue = [];
  synth?.cancel();
  if (native) native.stop().catch(() => {});
  nativeAudio?.pause();
  nativeAudio = null;
  if (nativeAudioUrl) URL.revokeObjectURL(nativeAudioUrl);
  nativeAudioUrl = null;
  speaking = false;
  updateState();
}
function speak(text, force = false) {
  stopSpeech();
  if (native) {
    if (!force && !byId('speech').checked) return;
    const generation = speechGeneration;
    speaking = true;
    updateState();
    native.speak({ text, rate: Number(byId('rate').value) }).then(audio => {
      if (generation !== speechGeneration) return;
      nativeAudioUrl = URL.createObjectURL(new Blob([audio], { type: 'audio/wav' }));
      nativeAudio = new Audio(nativeAudioUrl);
      nativeAudio.preservesPitch = false;
      nativeAudio.playbackRate = Number(byId('pitch').value);
      nativeAudio.onended = () => { if (generation === speechGeneration) stopSpeech(); };
      nativeAudio.onerror = () => { if (generation === speechGeneration) { stopSpeech(); notice('Nao consegui reproduzir o audio local.'); } };
      return nativeAudio.play();
    }).catch(error => { if (generation === speechGeneration) { speaking = false; updateState(); notice(error.message); } });
    return;
  }
  if (!synth || (!force && !byId('speech').checked)) return;
  if (!voices.length) { notice('Nenhuma voz disponivel. Instale uma voz de portugues nas configuracoes de Fala do Windows.'); return; }
  const generation = speechGeneration;
  const chunks = text.replace(/https?:\/\/\S+/g, 'link disponivel na conversa').match(/.{1,180}(?:\s|$)|\S{1,180}/g) || [text];
  speechQueue = chunks;
  speaking = true;
  updateState();
  const next = () => {
    if (generation !== speechGeneration) return;
    if (!speechQueue.length) { speaking = false; updateState(); return; }
    const utterance = new SpeechSynthesisUtterance(speechQueue.shift());
    utterance.voice = voices.find(voice => voice.voiceURI === byId('voice').value) || null;
    utterance.lang = utterance.voice?.lang || 'pt-BR';
    utterance.rate = Number(byId('rate').value);
    utterance.pitch = Number(byId('pitch').value);
    utterance.onend = next;
    utterance.onerror = event => {
      if (generation !== speechGeneration) return;
      speaking = false;
      speechQueue = [];
      updateState();
      if (!['canceled', 'interrupted'].includes(event.error)) notice('Nao consegui reproduzir a voz. Confira a voz selecionada e o audio do navegador.');
    };
    synth.speak(utterance);
  };
  next();
}
function loadVoices() {
  if (native) {
    voices = [{ voiceURI: 'faber', name: 'Faber / pt-BR / offline' }];
    byId('voice').replaceChildren(new Option(voices[0].name, 'faber'));
    updateState();
    return;
  }
  voices = synth?.getVoices() || [];
  const preferred = preferences.voice;
  byId('voice').replaceChildren(new Option('Padrao do sistema', ''));
  const sorted = [...voices].sort((left, right) => Number(right.lang.startsWith('pt')) - Number(left.lang.startsWith('pt')) || left.name.localeCompare(right.name));
  for (const voice of sorted) byId('voice').add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI));
  const recommended = sorted.find(voice => /pt[-_]BR/i.test(voice.lang) && /antonio|daniel|paulo|duarte/i.test(voice.name)) || sorted.find(voice => /pt[-_]BR/i.test(voice.lang)) || sorted.find(voice => voice.lang.startsWith('pt'));
  byId('voice').value = preferred !== undefined && (!preferred || voices.some(voice => voice.voiceURI === preferred)) ? preferred : recommended?.voiceURI || '';
  updateState();
}
byId('voice').addEventListener('change', savePreferences);
byId('speech').addEventListener('change', () => { savePreferences(); if (!byId('speech').checked) stopSpeech(); });
synth?.addEventListener('voiceschanged', loadVoices);
loadVoices();

function addMessage(role, text, action) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  const label = document.createElement('div');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'VOCE' : 'JARVIS';
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  article.append(label, paragraph);
  if (action) {
    try {
      const url = new URL(action.url);
      if (url.protocol === 'https:' && ['www.google.com', 'www.youtube.com'].includes(url.hostname)) {
        const link = document.createElement('a');
        link.href = url.href;
        link.textContent = action.label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        if (native) link.addEventListener('click', event => { event.preventDefault(); native.openLink(url.href).catch(error => notice(error.message)); });
        article.append(link);
      }
    } catch {}
  }
  byId('messages').append(article);
  byId('messages').scrollTop = byId('messages').scrollHeight;
}
function greeting() { addMessage('assistant', 'A disposicao.\nO que vamos fazer hoje?'); }
async function submit(message) {
  const text = message.trim();
  if (!text || busy) return;
  if (text.length > 2000) { notice('Limite de 2000 caracteres por mensagem.'); return; }
  recognition?.abort();
  listening = false;
  stopSpeech();
  busy = true;
  updateState();
  notice();
  addMessage('user', text);
  byId('prompt').value = '';
  resizePrompt();
  try {
    let data;
    if (native) data = await native.chat({ message: text, history });
    else {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history }), signal: AbortSignal.timeout(55000) });
      data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao receber resposta.');
    }
    history.push({ role: 'user', content: text }, { role: 'assistant', content: data.text });
    history.splice(0, Math.max(0, history.length - 16));
    addMessage('assistant', data.text, data.action);
    speak(data.text);
  } catch (error) {
    notice(error.name === 'TimeoutError' ? 'A resposta demorou demais. Tente novamente.' : error.message === 'Failed to fetch' ? 'Sem conexao com o JARVIS. Confira se o terminal esta aberto.' : error.message);
    byId('prompt').value = text;
    resizePrompt();
  } finally { busy = false; updateState(); }
}
byId('composer').addEventListener('submit', event => { event.preventDefault(); submit(byId('prompt').value); });
byId('prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(byId('prompt').value); }
});
function resizePrompt() { byId('prompt').style.height = 'auto'; byId('prompt').style.height = `${Math.min(byId('prompt').scrollHeight, 150)}px`; }
byId('prompt').addEventListener('input', resizePrompt);
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => submit(button.dataset.prompt)));
byId('clear').addEventListener('click', () => { recognition?.abort(); stopSpeech(); history.length = 0; byId('messages').replaceChildren(); notice(); greeting(); });
byId('stop').addEventListener('click', stopSpeech);
byId('settings-button').addEventListener('click', () => byId('settings').showModal());
byId('close-settings').addEventListener('click', () => byId('settings').close());
byId('test-voice').addEventListener('click', () => { recognition?.abort(); listening = false; speak('A disposicao. Sistemas prontos. Em que posso ajudar?', true); });
if (Recognition) {
  recognition = new Recognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onstart = () => { listening = true; updateState(); };
  recognition.onend = () => { listening = false; updateState(); };
  recognition.onresult = event => {
    const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ');
    byId('prompt').value = transcript.slice(0, 2000);
    resizePrompt();
    if (event.results[event.results.length - 1].isFinal) submit(transcript);
  };
  recognition.onerror = event => {
    const errors = { 'not-allowed': 'Permita o microfone nas configuracoes deste site.', 'audio-capture': 'Nenhum microfone disponivel.', 'no-speech': 'Nao ouvi uma fala. Tente novamente.', network: 'O reconhecimento de voz precisa de conexao com o servico do navegador.', 'service-not-allowed': 'Reconhecimento indisponivel neste navegador. Use Edge ou Chrome.' };
    if (event.error !== 'aborted') notice(event.message || errors[event.error] || 'Nao foi possivel reconhecer a fala. Tente digitar.');
    listening = false;
    updateState();
  };
}
byId('mic').addEventListener('click', () => {
  if (listening) { recognition?.stop(); return; }
  stopSpeech();
  notice();
  try { recognition?.start(); } catch { notice('Aguarde o microfone finalizar e tente novamente.'); }
});
window.addEventListener('pagehide', () => { recognition?.abort(); synth?.cancel(); });
async function checkStatus() {
  try {
    let status;
    if (native) status = await native.status();
    else {
      const response = await fetch('/api/status');
      if (!response.ok) throw new Error();
      status = await response.json();
    }
    byId('connection').textContent = native ? 'Aplicativo offline' : status.configured ? 'Sistema online' : 'IA sem chave';
    byId('engine').textContent = status.provider === 'local' ? 'MODO BASICO' : `IA / ${status.provider.toUpperCase()}`;
    byId('provider-info').textContent = status.provider === 'local' ? 'Local' : status.provider;
    byId('model-info').textContent = status.model || 'Comandos basicos';
    if (native) {
      byId('offline-settings').hidden = false;
      for (const kind of ['ai', 'microphone']) {
        byId(`install-${kind}`).disabled = Boolean(status[kind]);
        if (status[kind]) byId(`install-${kind}`).textContent = 'Instalado';
      }
    }
  } catch { byId('connection').textContent = 'Servidor indisponivel'; notice('Inicie o JARVIS pelo arquivo de inicializacao e recarregue a pagina.'); }
}
if (native) {
  native.onProgress(message => { byId('download-progress').textContent = message; });
  for (const kind of ['ai', 'microphone']) byId(`install-${kind}`).addEventListener('click', async () => {
    byId('install-ai').disabled = true;
    byId('install-microphone').disabled = true;
    byId('download-progress').textContent = 'Iniciando download...';
    try { await native.install(kind); byId('download-progress').textContent = 'Instalado. Disponivel sem internet.'; }
    catch (error) { byId('download-progress').textContent = error.message; }
    finally { await checkStatus(); }
  });
}
function tickClock() { byId('clock').textContent = new Date().toLocaleTimeString('pt-BR'); }
tickClock();
setInterval(tickClock, 1000);
greeting();
checkStatus();
updateState();

const canvas = byId('core');
const context = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function drawCore(timestamp) {
  const size = canvas.clientWidth;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(size * ratio)) { canvas.width = Math.round(size * ratio); canvas.height = Math.round(size * ratio); }
  if (context && size > 0) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(size / 2, size / 2);
    const time = reducedMotion.matches ? 0 : timestamp / 1000;
    const radius = size * .32;
    const active = listening || speaking || busy;
    for (let ring = 0; ring < 4; ring += 1) {
      context.beginPath();
      context.strokeStyle = ['#517e69', '#83d4b4', '#3f6556', '#2d453b'][ring];
      context.lineWidth = ring === 1 ? 2 : 1;
      const offset = time * (ring % 2 ? .13 : -.09);
      context.arc(0, 0, radius + ring * size * .033, offset + .2, offset + Math.PI * (ring === 1 ? 1.65 : 1.94));
      context.stroke();
    }
    for (let index = 0; index < 96; index += 1) {
      const angle = index / 96 * Math.PI * 2;
      const length = active ? 5 + (Math.sin(time * 6 + index * .8) + 1) * 8 : index % 4 === 0 ? 9 : 3;
      const inner = radius * .78;
      context.beginPath();
      context.strokeStyle = listening ? '#e99a59' : index % 8 === 0 ? '#d6f9df' : '#4d9579';
      context.lineWidth = 1.4;
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length));
      context.stroke();
    }
    context.fillStyle = '#e99a59';
    context.fillRect(-2, -radius - size * .105, 4, 8);
    context.restore();
  }
  requestAnimationFrame(drawCore);
}
requestAnimationFrame(drawCore);