import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'*.spec.mjs',workers:1,timeout:30000,use:{browserName:'chromium',viewport:{width:520,height:900},headless:true},webServer:{command:'node tests/ui-server.mjs',url:'http://127.0.0.1:18377',reuseExistingServer:false,timeout:15000}});
