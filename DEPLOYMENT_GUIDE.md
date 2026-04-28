# 🚀 AI Builder - Deployment Guide

## ⚡ One-Click Deploy Options

### Vercel (Recommended)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-org%2Fai-builder&env=NEXTAUTH_SECRET,DATABASE_URL,INTERNAL_API_KEY&envDescription=Required%20environment%20variables&envLink=https%3A%2F%2Fgithub.com%2Fyour-org%2Fai-builder%2Fblob%2Fmain%2F.env.example)

**Pre-requisites:**
1. Fork this repo to your GitHub
2. Create a PostgreSQL database (Neon, Supabase, or Vercel Postgres)
3. Generate a secure `NEXTAUTH_SECRET`: `openssl rand -base64 32`
4. Set environment variables in Vercel dashboard

### Railway
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/ai-builder)

### Render
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/your-org/ai-builder)

---

## 🐳 Docker Deployment (Self-Hosted)

### Quick Start