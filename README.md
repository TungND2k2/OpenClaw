# OpenClaw

Hệ thống **local-first, hierarchical multi-agent orchestration** — điều phối nhiều AI agent hoạt động semi-autonomous.

## Kiến trúc

```
┌──────────────────────────────────────────────────┐
│                   COMMANDER                       │
│  Nhận goal → phân rã → điều phối → giám sát      │
└──────────┬───────────────────────┬───────────────┘
           │                       │
  ┌────────▼────────┐    ┌────────▼────────┐
  │   SUPERVISOR    │    │   SUPERVISOR    │
  │  Quản lý nhóm   │    │  Quản lý nhóm   │
  └───┬─────────┬───┘    └───┬─────────┬───┘
  ┌───▼───┐ ┌──▼────┐   ┌───▼───┐ ┌──▼────┐
  │SPECIAL│ │WORKER │   │SPECIAL│ │WORKER │
  │ IST   │ │       │   │ IST   │ │       │
  └───────┘ └───────┘   └───────┘ └───────┘
```

### Thành phần chính

| Module | Mô tả |
|---|---|
| **Agent Hierarchy** | Phân cấp Commander → Supervisor → Specialist → Worker |
| **Orchestration Engine** | Task decomposition, DAG execution, auto-assign, retry, escalation |
| **ClawTask** | Task lifecycle: pending → assigned → in_progress → completed/failed |
| **Knowledge System** | Agent tự học từ kinh nghiệm, lưu lessons learned, query trước khi làm |
| **Workflow Engine** | Business workflows: forms, validation, approval, notifications |
| **Rules Engine** | Declarative JSON conditions (no eval), auto-approve/escalate |
| **MCP Layer** | 66 MCP tools + 3 resources — giao diện chuẩn cho mọi agent |
| **Proxy** | Multi-model routing: Commander → Claude, Workers → cheap API |
| **Telegram Bot** | Transport layer — delegate mọi thứ cho Commander agent |

## Yêu cầu

- Node.js >= 20
- npm

## Cài đặt

```bash
git clone <repo-url>
cd OpenClaw
npm install
```

## Cấu hình

Copy `.env.example` → `.env` và điền:

```bash
cp .env.example .env
```

```env
# Database
DATABASE_URL=./data/openclaw.db

# LLM — Commander (model mạnh)
COMMANDER_API_BASE=https://api.anthropic.com
COMMANDER_API_KEY=sk-ant-...
COMMANDER_MODEL=claude-sonnet-4-20250514

# LLM — Workers (model rẻ)
WORKER_API_BASE=https://your-cheap-api.com/v1
WORKER_API_KEY=your-key
WORKER_MODEL=gpt-4o-mini

# Proxy
PROXY_PORT=3101

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_DEFAULT_TENANT_ID=  # sẽ có sau khi chạy setup
```

## Khởi chạy

### 1. Setup dữ liệu demo

```bash
npx tsx scripts/setup-demo.ts <YOUR_TELEGRAM_ID>
```

Script tạo:
- Tenant "Demo Corp"
- Workflow "Tạo Đơn Hàng" (form → confirm → complete)
- Form template (tên KH, SĐT, sản phẩm, số lượng)
- Business rule (đơn > 5M cần manager duyệt)
- Commander + Sales Bot agents
- Admin user (Telegram ID bạn cung cấp)

Copy `TELEGRAM_DEFAULT_TENANT_ID` từ output vào `.env`.

### 2. Chạy hệ thống

```bash
npx tsx src/index.ts
```

Sẽ start:
- SQLite database + migrations
- MCP server (66 tools, 3 resources)
- Orchestrator tick loop (5s)
- LLM Proxy (multi-model routing)
- Telegram bot (long-polling)

### 3. Build production

```bash
npm run build
node dist/index.js
```

## Sử dụng

### Telegram Bot

Nhắn cho bot trên Telegram:

| Tin nhắn | Bot làm gì |
|---|---|
| "xin chào" | AI trả lời tự nhiên |
| "tạo quy trình chăm sóc KH" | Commander tạo workflow trong DB |
| "viết tutorial cho sale mới" | Commander lưu tutorial vào knowledge base |
| "xem danh sách quy trình" | Commander query DB, trả về danh sách |
| "tạo đơn hàng" | Commander start workflow instance |
| bất kỳ câu hỏi | Commander dùng LLM trả lời thông minh |

**Admin** (role trong DB) có thể: tạo workflow, tutorial, rules, quản lý user roles.
**User** thường: chỉ sử dụng workflow có sẵn, hỏi đáp.

### MCP Server

Thêm vào Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/OpenClaw"
    }
  }
}
```

66 tools available — xem chi tiết trong [ARCHITECTURE.md](ARCHITECTURE.md).

### Proxy API

Agents gọi LLM qua proxy để auto-track token + cost:

```bash
curl http://127.0.0.1:3101/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-agent-id: agent-123" \
  -H "x-task-id: task-456" \
  -d '{"model":"claude-sonnet-4-20250514","messages":[{"role":"user","content":"Hello"}],"max_tokens":100}'
```

Proxy tự route:
- Commander/Supervisor → Anthropic API
- Worker/Specialist → Cheap API

## Cấu trúc thư mục

```
OpenClaw/
├── src/
│   ├── index.ts                    # Entry point
│   ├── config.ts                   # Zod-validated env config
│   ├── db/
│   │   ├── schemas/                # 7 schema files, 22 tables
│   │   ├── schema.ts               # Re-export all
│   │   ├── connection.ts           # SQLite + WAL + Drizzle
│   │   └── migrate.ts
│   ├── modules/
│   │   ├── agents/                 # Agent registration, heartbeat, performance
│   │   ├── hierarchy/              # Closure table, authorization, promotion
│   │   ├── tasks/                  # Task CRUD, lifecycle, dependencies
│   │   ├── orchestration/          # Decision engine, decomposer, DAG executor, tick loop
│   │   ├── messaging/              # Inter-agent communication
│   │   ├── decisions/              # Audit trail
│   │   ├── monitoring/             # Suspend, kill, budget, dashboard
│   │   ├── knowledge/              # Self-learning, retrieval, scoring
│   │   ├── workflows/              # Workflow engine, form engine, rules engine
│   │   ├── tenants/                # Multi-tenant
│   │   ├── integrations/           # Webhook, Telegram, Email connectors
│   │   ├── conversations/          # Chat sessions, form collection
│   │   ├── logs/                   # Structured task logs
│   │   ├── notebooks/              # Namespaced key-value store
│   │   └── analytics/              # Metrics, cost reports
│   ├── mcp/
│   │   ├── server.ts               # 66 tools, 3 resources
│   │   ├── tools/                  # 15 tool files
│   │   └── resources/              # 2 resource files
│   ├── proxy/
│   │   ├── proxy.service.ts        # Multi-model LLM proxy
│   │   └── cost.tracker.ts         # Token accounting
│   └── bot/
│       ├── telegram.bot.ts         # Transport layer (long-polling)
│       └── agent-bridge.ts         # Commander AI — tool calling
├── scripts/
│   └── setup-demo.ts              # Demo data + admin user setup
├── tests/                          # 39 tests
├── drizzle/                        # Generated migrations
├── data/                           # SQLite DB (gitignored)
├── ARCHITECTURE.md                 # Full architecture docs
└── .env.example
```

## Database

22 tables trong SQLite:

| Nhóm | Tables |
|---|---|
| **Agents** | agents, agent_hierarchy, tenant_users |
| **Tasks** | tasks, task_dependencies, task_logs |
| **Orchestration** | messages, decisions, execution_plans |
| **Storage** | notebooks, token_usage |
| **Knowledge** | knowledge_entries, knowledge_votes, knowledge_applications |
| **Business** | tenants, workflow_templates, form_templates, business_rules, workflow_instances, workflow_approvals, integrations, conversation_sessions |

## Tests

```bash
npm test           # chạy tất cả
npm run test:watch # watch mode
```

6 test suites, 39 tests:
- hierarchy (authorization, closure table, promotion)
- tasks (lifecycle, dependencies, depth limit)
- rules-engine (AND/OR/NOT, nested, operators)
- form-engine (validation, conditional fields, chat parsing)
- knowledge (store, retrieve, scoring, extraction)
- integration-e2e (goal→decompose→execute, cost tracking, workflow)

## Deploy

### Docker (recommended)

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
RUN mkdir -p data
CMD ["node", "dist/index.js"]
```

```bash
docker build -t openclaw .
docker run -d --name openclaw \
  -v openclaw-data:/app/data \
  --env-file .env \
  openclaw
```

### Linux server

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Clone + install
git clone <repo> /opt/openclaw
cd /opt/openclaw
npm ci

# Setup
cp .env.example .env
# edit .env with your config
npx tsx scripts/setup-demo.ts <TELEGRAM_ID>

# Run with pm2
npm i -g pm2
pm2 start "npx tsx src/index.ts" --name openclaw
pm2 save
pm2 startup
```

## License

Private — OpenClaw
