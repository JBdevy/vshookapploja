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
