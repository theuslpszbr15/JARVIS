if (window.jarvis) {
  window.DesktopRecognition = class {
    constructor() { this.session = 0; this.active = false; }
    async start() {
      if (this.active) return;
      const session = ++this.session;
      this.active = true;
      try {
        const status = await window.jarvis.status();
        if (!status.microphone) throw new Error('Baixe o microfone offline nos ajustes.');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        if (session !== this.session) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream;
        this.recorder = new MediaRecorder(stream);
        const chunks = [];
        this.recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        this.recorder.onerror = () => { this.abort(); this.onerror?.({ message: 'Nao foi possivel gravar o microfone.' }); };
        this.recorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          if (session !== this.session) return;
          this.active = false;
          this.onend?.();
          let audioContext;
          try {
            audioContext = new AudioContext({ sampleRate: 16000 });
            const decoded = await audioContext.decodeAudioData(await new Blob(chunks).arrayBuffer());
            const samples = decoded.getChannelData(0);
            const buffer = new ArrayBuffer(44 + samples.length * 2);
            const view = new DataView(buffer);
            const writeText = (offset, text) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); };
            writeText(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); writeText(8, 'WAVE'); writeText(12, 'fmt ');
            view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
            view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
            writeText(36, 'data'); view.setUint32(40, samples.length * 2, true);
            for (let index = 0; index < samples.length; index += 1) view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, samples[index])) * 32767, true);
            if (session !== this.session) return;
            document.getElementById('notice').textContent = 'Transcrevendo no computador...';
            const transcript = await window.jarvis.transcribe(new Uint8Array(buffer));
            if (session !== this.session) return;
            if (!transcript) throw new Error('Nao reconheci uma fala. Tente novamente.');
            this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal: true })] });
          } catch (error) { if (session === this.session) this.onerror?.({ message: error.message }); }
          finally { await audioContext?.close(); }
        };
        this.recorder.start();
        this.onstart?.();
        document.getElementById('notice').textContent = 'Gravando. Clique novamente para enviar (limite: 20 segundos).';
        this.timer = setTimeout(() => this.stop(), 20000);
      } catch (error) {
        this.active = false;
        this.onerror?.({ message: error.name === 'NotAllowedError' ? 'Permita o acesso ao microfone nas configuracoes do Windows.' : error.message });
      }
    }
    stop() {
      clearTimeout(this.timer);
      if (this.recorder?.state === 'recording') this.recorder.stop();
    }
    abort() {
      this.session += 1;
      this.stop();
      this.stream?.getTracks().forEach(track => track.stop());
      this.active = false;
      this.onend?.();
    }
  };
}