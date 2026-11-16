export function localReply(input, now = new Date()) {
  const text = input.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(horas|hora certa|que hora)\b/.test(text)) {
    return { text: `Agora sao ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now)}.` };
  }
  if (/\b(data|que dia|dia de hoje)\b/.test(text)) {
    return { text: `Hoje e ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(now)}.` };
  }
  const calculation = text.match(/^(?:calcule|quanto e)\s+(-?\d+(?:[.,]\d+)?)\s*(\+|-|\*|\/|mais|menos|vezes|dividido por)\s*(-?\d+(?:[.,]\d+)?)[?.!]?$/);
  if (calculation) {
    const left = Number(calculation[1].replace(',', '.'));
    const right = Number(calculation[3].replace(',', '.'));
    const operator = calculation[2];
    if ((operator === '/' || operator === 'dividido por') && right === 0) return { text: 'Nao e possivel dividir por zero.' };
    const operations = { '+': () => left + right, mais: () => left + right, '-': () => left - right, menos: () => left - right, '*': () => left * right, vezes: () => left * right, '/': () => left / right, 'dividido por': () => left / right };
    const result = operations[operator]();
    return { text: Number.isFinite(result) ? `O resultado e ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 }).format(result)}.` : 'Esse calculo excede o limite numerico.' };
  }
  const search = input.trim().match(/^(?:pesquise|pesquisar|busque|buscar)\s+(.+)$/i);
  if (search) return { text: `Preparei uma pesquisa por: ${search[1]}.`, action: { label: 'Abrir pesquisa', url: `https://www.google.com/search?q=${encodeURIComponent(search[1])}` } };
  if (/^(?:abra|abrir)\s+(youtube|google)[.!]?$/.test(text)) {
    const site = text.includes('youtube') ? 'YouTube' : 'Google';
    return { text: `O acesso ao ${site} esta pronto.`, action: { label: `Abrir ${site}`, url: site === 'YouTube' ? 'https://www.youtube.com/' : 'https://www.google.com/' } };
  }
  if (/^(oi|ola|bom dia|boa tarde|boa noite|jarvis)[!.,\s]*$/.test(text)) return { text: 'A disposicao. Em que posso ajudar?' };
  if (/\b(ajuda|comandos|o que voce faz)\b/.test(text)) return { text: 'Posso informar a hora e a data, fazer contas simples, preparar pesquisas e abrir links do Google ou YouTube. Com uma IA configurada, tambem posso conversar sobre outros assuntos.' };
  return null;
}