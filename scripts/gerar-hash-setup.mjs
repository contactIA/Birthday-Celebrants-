// Gera o SETUP_PASSWORD_HASH a partir da senha da área de setup.
//
// Uso: npm run setup:senha                 — imprime a linha para colar no .env
//      node scripts/gerar-hash-setup.mjs --gravar .env   — grava direto no arquivo
//
// A senha é digitada aqui, no terminal de quem configura, e nunca é gravada:
// só o hash vai para o .env. Importa a MESMA função que o servidor usa para
// conferir — um formato diferente aqui travaria o login.
//
// Na VPS, `deploy/definir-senha-setup.sh` roda este script com `--gravar` e
// redeploya — um comando só, sem editar arquivo à mão.
//
// Roda direto no Node 24 (type stripping nativo lê o .ts).
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { gerarHashDeSenha } from '../src/acesso/setup.ts'

const TAMANHO_MINIMO = 14

// UMA leitura para as duas perguntas, consumida pelo iterador. Uma interface
// por pergunta perdia a confirmação: a primeira engolia a entrada inteira e a
// segunda esperava para sempre. O eco do que é digitado vai para uma saída
// muda — os prompts são escritos direto no stdout.
const silencio = new Writable({
  write(_chunk, _enc, feito) {
    feito()
  },
})
const rl = createInterface({ input: process.stdin, output: silencio, terminal: process.stdin.isTTY === true })
rl.on('SIGINT', () => {
  process.stdout.write('\n')
  process.exit(130)
})
const linhas = rl[Symbol.asyncIterator]()

/** Lê uma linha sem ecoar o que é digitado. */
async function perguntarEscondido(pergunta) {
  process.stdout.write(pergunta)
  const { value, done } = await linhas.next()
  process.stdout.write('\n')
  return done ? '' : value
}

const senha = await perguntarEscondido('Senha da área de setup: ')
if (senha.length < TAMANHO_MINIMO) {
  console.error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`)
  process.exit(1)
}
const confirmacao = await perguntarEscondido('Repita a senha: ')
rl.close()
if (confirmacao !== senha) {
  console.error('As senhas não conferem.')
  process.exit(1)
}

const linha = `SETUP_PASSWORD_HASH=${gerarHashDeSenha(senha)}`
const indiceGravar = process.argv.indexOf('--gravar')

if (indiceGravar === -1) {
  console.log('\nCole no .env do servidor:\n')
  console.log(linha)
} else {
  const arquivo = process.argv[indiceGravar + 1]
  if (!arquivo) {
    console.error('Informe o arquivo: --gravar .env')
    process.exit(1)
  }
  // Substitui a linha existente ou acrescenta no fim — nunca duplica, senão o
  // `source` do deploy.sh ficaria com o último valor e o compose com outro.
  const atual = readFileSync(arquivo, 'utf8')
  const semAntiga = atual.split('\n').filter((l) => !l.startsWith('SETUP_PASSWORD_HASH='))
  while (semAntiga.length && semAntiga.at(-1) === '') semAntiga.pop()
  writeFileSync(arquivo, [...semAntiga, linha, ''].join('\n'))
  console.log(`\nSenha do setup gravada em ${arquivo}.`)
}
