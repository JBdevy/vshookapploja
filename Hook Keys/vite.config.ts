import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, '');
  const backendUrl = env.HOOK_KEYS_DEV_BACKEND_URL || 'https://hookupdate7.up.railway.app';

  return {
    envDir: projectDirectory,
    server: {
      host: '0.0.0.0',
      // O Tauri sempre carrega 5173. Se uma execução antiga estiver usando a
      // porta, falhe claramente em vez de abrir outra porta e deixar a janela
      // apontando para conteúdo antigo ou para uma tela branca.
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
    },
  };
});
