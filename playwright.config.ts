import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

const browserNames = process.platform === 'win32'
  ? ['chromium.exe', 'chrome.exe']
  : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']
const searchPaths = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
const configuredPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const executablePath = configuredPath
  ? resolve(configuredPath)
  : browserNames.flatMap(name => searchPaths.map(path => join(path, name))).find(isExecutable)

if (!executablePath || !isExecutable(executablePath)) {
  throw new Error(
    '未找到可执行的系统 Chromium/Chrome。请安装系统浏览器，或设置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH。'
  )
}

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: { executablePath }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI
  }
})
