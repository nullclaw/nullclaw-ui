import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [sveltekit(), mode === 'test' ? svelteTesting() : undefined],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
}));
