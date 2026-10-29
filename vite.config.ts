import preact from "@preact/preset-vite";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const POSTHOG_HOST = process.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com";

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${POSTHOG_HOST}`,
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const contentSecurityPolicy = (): Plugin => ({
  name: "pgt-content-security-policy",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY }, injectTo: "head" }],
});

export default defineConfig({
  root: "src/web",
  base: "./",
  plugins: [preact(), contentSecurityPolicy()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
    env: { TZ: "UTC" },
  },
});
