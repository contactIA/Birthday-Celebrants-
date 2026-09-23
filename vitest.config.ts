import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// O kernel em `src/shared` é função pura por construção — roda em `node`, sem
// jsdom e sem subir Next. É o que torna barato testar as regras que mais
// quebraram em produção (fuso, datas sentinela, telefone).
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
