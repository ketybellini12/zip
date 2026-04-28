# 🤖 AI Builder

> Chat-based AI development platform with code generation, MCP integration, and one-click deployment.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-org%2Fai-builder)

## ✨ Features

- 💬 AI Chat Interface with multiple providers (OpenAI, Claude, DeepSeek)
- 🛠️ Code Generation & IDE-like builder
- 🔌 MCP (Model Context Protocol) for external tool integration
- 🔐 Enterprise auth with GitHub, Vercel, email + RBAC
- 💳 Billing & credits system with Stripe
- 📊 Admin dashboard for user management
- 🌍 i18n support (EN, ES, FR, JA, KO, ZH, NO)
- 🐳 Docker + Kubernetes ready
- 🚀 One-click deploy to Vercel/Railway

## 🚀 Quick Start

### Option 1: Vercel (Easiest)
1. Click [Deploy with Vercel](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-org%2Fai-builder)
2. Set required env vars:
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `DATABASE_URL` (use Vercel Postgres or Neon)
   - `INTERNAL_API_KEY` (any 16+ char string)
3. Deploy!

### Option 2: Local Development