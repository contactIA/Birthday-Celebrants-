// Gera o SETUP_PASSWORD_HASH a partir da senha da área de setup.
//
// Uso: npm run setup:senha
//
// A senha é digitada aqui, no terminal de quem configura, e nunca sai da
// máquina: só o hash vai para o .env do servidor. Importa a MESMA função que o
// servidor usa para conferir — um formato diferente aqui travaria o login.
//
// Roda direto no Node 24 (type stripping nativo lê o .ts).
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { gerarHashDeSenha } from '../src/acesso/setup.ts'

const TAMANHO_MINIMO = 14

/** Lê uma linha sem ecoar o que é digitado. */
function perguntarEscondido(pergunta) {
  let mudo = false
  const saida = new Writable({
    write(chunk, _enc, feito) {
      if (!mudo) process.stdout.write(chunk)
      feito()
    },
  })
  const rl = createInterface({ input: process.stdin, output: saida, terminal: true })
  return new Promise((resolve) => {
    rl.question(pergunta, (resposta) => {
      rl.close()
      process.stdout.write('\n')
      resolve(resposta)
    })
    mudo = true
  })
}

const senha = await perguntarEscondido('Senha da área de setup: ')
if (senha.length < TAMANHO_MINIMO) {
  console.error(`A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`)
  process.exit(1)
}
const confirmacao = await perguntarEscondido('Repita a senha: ')
if (confirmacao !== senha) {
  console.error('As senhas não conferem.')
  process.exit(1)
}

console.log('\nCole no .env do servidor:\n')
console.log(`SETUP_PASSWORD_HASH=${gerarHashDeSenha(senha)}`)
