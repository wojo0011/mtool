import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const isUserSiteRepository = repositoryName.toLowerCase().endsWith('.github.io')
const githubPagesBase = repositoryName.length > 0 && !isUserSiteRepository ? `/${repositoryName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? githubPagesBase : '/',
})
