import test from 'node:test';
import assert from 'node:assert/strict';
import { localReply } from '../lib/commands.mjs';

test('responde a saudacoes e comandos com acentos', () => {
  assert.match(localReply('Ol\u00e1!').text, /disposicao/);
  assert.match(localReply('Que horas sao?').text, /Agora sao/);
  assert.match(localReply('Qual a data?').text, /Hoje e/);
});

test('calcula sem executar codigo', () => {
  assert.equal(localReply('calcule 2,5 vezes 4').text, 'O resultado e 10.');
  assert.equal(localReply('quanto e -2 + 8?').text, 'O resultado e 6.');
  assert.match(localReply('calcule 1 / 0').text, /zero/);
  assert.equal(localReply('calcule process.exit()'), null);
});

test('pesquisa codificada e sites permitidos', () => {
  const reply = localReply('pesquise cafe & livros');
  assert.equal(new URL(reply.action.url).searchParams.get('q'), 'cafe & livros');
  assert.equal(localReply('abra youtube').action.url, 'https://www.youtube.com/');
  assert.equal(localReply('abra cmd.exe'), null);
});

test('perguntas livres seguem para a IA', () => {
  assert.equal(localReply('Explique a relatividade'), null);
});