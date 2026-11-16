# JARVIS Desktop

## Versao Atual: Aplicativo Windows

Abra `dist/JARVIS.exe` ou `Iniciar JARVIS.cmd`. O executavel inclui seu proprio runtime e uma voz sintetica brasileira local (Piper/Faber). Nao requer navegador, Node.js instalado, servidor, localhost, chave de API ou terminal aberto.

Hora, data, contas e respostas faladas funcionam offline imediatamente. Para conversa livre, use Ajustes > Baixar IA (aproximadamente 1.2 GB). Para entrada por microfone, use Ajustes > Microfone offline > Baixar (aproximadamente 160 MB). Esses downloads exigem internet uma vez; os motores passam a rodar no computador, sem Ollama ou servicos externos. O modelo pequeno pode errar e tem capacidade limitada. Pesquisas e links externos naturalmente precisam de internet.

A voz incluida e Faber, nao a voz original do JARVIS nem uma clonagem do ator. Tonalidade e velocidade podem ser ajustadas; a mudanca de tonalidade tambem afeta a velocidade de reproducao. Um modelo autorizado compativel seria necessario para usar outra identidade vocal.

No microfone, clique para iniciar e novamente para enviar; a gravacao termina automaticamente em 20 segundos. Nao ha palavra de ativacao. Audio e prompts temporarios sao apagados apos o processamento. Historico fica apenas na memoria da janela; preferencias e motores baixados ficam no perfil local do aplicativo em `%APPDATA%/jarvis-local`. Durante um download, mantenha o aplicativo aberto. Se houver interrupcao, repita o download.

O executavel nao possui assinatura digital comercial, portanto o Windows pode exibir um aviso de editor desconhecido. Nao e necessario desativar antivirus nem executar como administrador.

Desenvolvimento: `npm install`, `npm run setup:voice`, `npm start`. Testes: `npm test` e `npm run test:ui`. Empacotamento: `npm run build`. O teste desktop bloqueia a rede e verifica comandos, seguranca do IPC e audio Piper real. IA e transcricao exigem seus modelos baixados para verificacao ponta a ponta.

Fontes dos motores: Electron, Piper (https://github.com/rhasspy/piper), llama.cpp (https://github.com/ggml-org/llama.cpp) e whisper.cpp (https://github.com/ggml-org/whisper.cpp). Voz: https://huggingface.co/rhasspy/piper-voices, pt_BR/faber/medium, dataset CC0 conforme MODEL_CARD incluido. Modelo opcional: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF. Licencas e avisos dos componentes permanecem nos pacotes distribuídos.

## Documentacao Legada: Prototipo Web

As instrucoes abaixo pertencem apenas ao prototipo antigo em `server.mjs`. Nao sao usadas pelo aplicativo desktop e nao sao necessarias para executa-lo. O comando `npm start` agora abre o aplicativo desktop, nao o servidor.

Assistente pessoal em portugues com interface visual, entrada por texto, microfone por botao e voz sintetica do navegador. Projeto independente inspirado em ficcao cientifica, sem vinculo oficial com Marvel.

## Iniciar

1. Abra `Iniciar JARVIS.cmd` com dois cliques. Requer Node.js 20 ou superior.
2. Mantenha o terminal aberto. O navegador abre automaticamente no endereco local mostrado nele, normalmente http://127.0.0.1:4317.
3. Use Edge ou Chrome. Clique no microfone e permita o acesso quando solicitado.
4. Abra o botao de ajustes para escolher a voz e testar o audio. O botao quadrado interrompe a fala. Fechar o terminal encerra o servidor.

Se a porta estiver ocupada, outra porta livre sera escolhida automaticamente.

## Voz

Nao inclui nem clona a voz do ator/dublador do Homem de Ferro. Usa vozes sinteticas instaladas ou disponibilizadas pelo Windows e pelo navegador. Seleciona preferencialmente uma voz em pt-BR; a disponibilidade e a naturalidade variam. Para uma voz masculina, procure Antonio, Daniel ou outra opcao masculina no seletor. Velocidade e tonalidade sao ajustaveis. Instale vozes em Configuracoes do Windows > Hora e idioma > Fala se necessario.

O microfone nao fica ouvindo continuamente e nao ha palavra de ativacao. O reconhecimento de fala pode enviar audio ao servico do navegador e precisar de internet. A sintese tambem pode depender de rede para determinadas vozes. A aplicacao nao grava audio. Teste fisico do microfone e dos alto-falantes precisa ser feito pelo usuario.

## Modo basico

Funciona sem chave e sem modelo de linguagem: hora, data, saudacoes, contas de dois numeros, pesquisas e links permitidos.

- `Que horas sao?`
- `Qual a data de hoje?`
- `Calcule 25 vezes 4`
- `Pesquise noticias de tecnologia`
- `Abra YouTube`

Links precisam de um clique para abrir. Nao executa comandos do Windows, nao acessa arquivos pessoais e nao pesquisa a web por conta propria.

## Conversas com IA

Por padrao nenhuma IA esta conectada. Duplique `.env.example` como `.env` na mesma pasta e configure uma das opcoes. Reinicie o JARVIS depois de alterar a configuracao. Nunca compartilhe sua chave.

### Ollama local

Instale Ollama em https://ollama.com, mantenha o servico iniciado e baixe o modelo:

```powershell
ollama pull qwen2.5:3b
```

No `.env`:

```dotenv
AI_PROVIDER=ollama
AI_MODEL=qwen2.5:3b
OLLAMA_URL=http://127.0.0.1:11434
```

O modelo exige download e recursos de RAM/CPU; nao foi instalado automaticamente. O tempo de resposta depende do computador. Apos baixar, a conversa via Ollama pode funcionar offline, mas o reconhecimento de voz do navegador pode continuar precisando de internet.

### OpenAI

No `.env`, informe sua propria chave de API:

```dotenv
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=sua_chave_aqui
```

Requer internet e pode gerar cobrancas na conta de API; uma assinatura do ChatGPT nao substitui os creditos de API. As perguntas que nao forem comandos locais e ate 16 mensagens de contexto serao enviadas ao provedor escolhido. O modelo de conversa e separado da voz: a fala continua sendo gerada pelo navegador.

## Privacidade e limites

Servidor restrito a 127.0.0.1, sem acesso pela rede local. A chave permanece no servidor e nao e enviada ao navegador. Historico mantido apenas na memoria da pagina; recarregar ou limpar conversa o apaga. Preferencias de voz ficam no armazenamento local do navegador. A IA nao tem ferramentas de automacao nem acesso em tempo real e pode errar.

## Desenvolvimento

```powershell
npm install
npm test
npm start
```

Testes de interface: com o servidor iniciado, execute `npm run test:ui`. Para instalar o navegador de teste, use `npx playwright install chromium`. Capturas ficam em `artifacts/`. Os testes usam dublos das APIs de fala; nao certificam a qualidade da voz ou o reconhecimento em hardware real.