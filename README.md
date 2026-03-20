# OpenClaw

**Local-first Hierarchical Multi-Agent Orchestration System**

Hệ thống điều phối nhiều AI agent hoạt động semi-autonomous — với phân cấp Commander → Supervisor → Worker, task decomposition, self-learning knowledge base, và tích hợp Telegram.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Luồng xử lý](#luồng-xử-lý)
- [Agent System](#agent-system)
- [Pipeline chi tiết](#pipeline-chi-tiết)
- [Modules](#modules)
- [MCP Tools (66)](#mcp-tools-66)
- [Database (22 tables)](#database-22-tables)
- [Telegram Bot](#telegram-bot)
- [Triển khai](#triển-khai)
- [Cấu hình](#cấu-hình)

---

## Tổng quan

```
┌─────────────────────────────────────────────────────────────┐
│                        OpenClaw                              │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Telegram  │  │  MCP Server  │  │    LLM Pool            │ │
│  │   Bot     │  │  (66 tools)  │  │  ┌────────┐ ┌───────┐ │ │
│  └─────┬─────┘  └──────┬───────┘  │  │ Strong │ │ Fast  │ │ │
│        │               │          │  │  LLM   │ │  LLM  │ │ │
│        ▼               ▼          │  └────────┘ └───────┘ │ │
│  ┌──────────────────────────────┐ └────────────────────────┘ │
│  │      Agent System            │                            │
│  │  Commander → Supervisor →    │◄──── Orchestrator (5s)     │
│  │  Worker → Tools → DB        │                            │
│  └──────────────────────────────┘                            │
│        │                                                     │
│        ▼                                                     │
│  ┌──────────┐  ┌────────────┐  ┌─────────┐  ┌────────────┐ │
│  │ SQLite   │  │ Knowledge  │  │   S3    │  │  Proxy     │ │
│  │  (22 tb) │  │   Base     │  │ Storage │  │  (routing) │ │
│  └──────────┘  └────────────┘  └─────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Highlights:**
- 66 MCP tools | 22 DB tables | 3 MCP resources
- Hierarchical agent system (Commander → Supervisor → Worker)
- Dynamic agent templates — tạo/spawn/kill agent qua chat, không cần code
- Self-learning knowledge base
- Message queue (concurrency 5, priority-based)
- Multi-tenant + role-based access control
- S3 file storage + DOCX/TXT/CSV content extraction
- LLM proxy routing (strong model cho Commander, cheap cho Workers)

---

## Kiến trúc hệ thống

```
                    ┌─────────────────────┐
                    │   User (Telegram)   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Message Queue     │
                    │  (priority, 5 con-  │
                    │   current workers)  │
                    └──────────┬──────────┘
                               │
               ┌───────────────▼───────────────┐
               │        AGENT SYSTEM           │
               │                               │
               │  ┌─────────────────────────┐  │
               │  │     Commander (1)       │  │
               │  │  Brain: Strong LLM      │  │
               │  │  Role: Phân rã, quyết   │  │
               │  │        định, tổng hợp   │  │
               │  └────────────┬────────────┘  │
               │               │               │
               │    ┌──────────┼──────────┐    │
               │    │          │          │    │
               │  ┌─▼──┐   ┌──▼─┐   ┌───▼┐   │
               │  │Sup │   │Sup │   │Sup │   │
               │  │Sale│   │Ops │   │Sup │   │
               │  └─┬──┘   └──┬─┘   └─┬──┘   │
               │    │         │        │       │
               │  ┌─▼──┐   ┌─▼──┐  ┌──▼─┐    │
               │  │W-1 │   │W-2 │  │W-3 │    │
               │  │mini│   │mini│  │mini│    │
               │  └────┘   └────┘  └────┘    │
               └───────────────────────────────┘
                               │
               ┌───────────────▼───────────────┐
               │         Tool Registry         │
               │  ┌─────┐ ┌─────┐ ┌─────────┐ │
               │  │ DB  │ │ S3  │ │Knowledge│ │
               │  │Query│ │File │ │  Base   │ │
               │  └─────┘ └─────┘ └─────────┘ │
               └───────────────────────────────┘
```

### Phân cấp Agent

| Level | Role | Authority | Brain (LLM) | Nhiệm vụ |
|-------|------|-----------|-------------|-----------|
| 4 | **Commander** | Full | Strong LLM | Nhận goal → phân rã → giao Supervisor → tổng hợp |
| 3 | **Supervisor** | Nhóm | Fast LLM | Nhận subtask → giao Workers → review → báo cáo |
| 2 | **Specialist** | Cá nhân | Fast LLM | Chuyên môn sâu (phân tích, dịch thuật...) |
| 1 | **Worker** | Thực thi | Fast LLM | Nhận task → gọi tools → trả kết quả |

### LLM Pool (tài nguyên chung)

```
LLM Pool
  ├── Strong LLM (cho Commander)
  │     └── Dùng cho: Phân rã task, quyết định phức tạp, tổng hợp
  │     └── Cấu hình: COMMANDER_API_BASE + COMMANDER_MODEL
  │
  └── Fast LLM (cho Workers)
        └── Dùng cho: Thực thi task đơn giản, gọi tools
        └── Cấu hình: WORKER_API_BASE + WORKER_MODEL
```

> Agent = nhân viên, LLM = bộ não. Mỗi agent khác nhau ở **system prompt** (job description), **tools** (quyền hạn), **cấp bậc** — không phải khác LLM.

---

## Luồng xử lý

### Flow tổng quát

```
User nhắn Telegram
  │
  ▼
┌──────────────────┐
│ 1. Message Queue │──→ Priority sort (admin=1, user=5)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 2. Knowledge     │──→ Tìm kiến thức đã học (keyword matching)
│    Lookup        │    Score > 0.3 → inject vào context
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 3. Commander     │──→ Strong LLM suy nghĩ
│    .think()      │    Phân tích intent → quyết định gọi tools
└────────┬─────────┘
         │
    ┌────┴────┐
    │ Tools?  │
    └────┬────┘
    YES  │  NO
    ▼    │  ▼
┌────────┐  ┌──────────┐
│Execute │  │Direct    │
│Tools   │  │Response  │
│(DB/S3/ │  └──────────┘
│API)    │
└───┬────┘
    │
    ▼
┌──────────────────┐
│ 4. Follow-up LLM │──→ Tổng hợp kết quả tools → response
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. Self-Learning │──→ Lưu Q&A vào Knowledge Base
│                  │    Lần sau hỏi tương tự → trả lời nhanh hơn
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 6. Performance   │──→ Cập nhật điểm agent
│    + Audit       │    Ghi decision log
└────────┬─────────┘
         │
         ▼
    User nhận response
```

### Flow phức tạp (multi-agent)

```
User: "Đọc cẩm nang sale, tóm tắt, rồi tạo quy trình onboarding"

═══ PHASE 1: COMMANDER NHẬN ═══
┌─────────────────────────────────────────────┐
│ Commander.think(Strong LLM):                │
│   "Task phức tạp, cần phân rã:             │
│    Subtask 1: Đọc file cẩm nang            │
│    Subtask 2: Phân tích nội dung            │
│    Subtask 3: Tạo quy trình onboarding"    │
│                                             │
│   → decompose_task() → 3 subtasks (DAG)    │
│   → assign → Supervisor-Sales              │
└─────────────────┬───────────────────────────┘
                  │
═══ PHASE 2: SUPERVISOR ĐIỀU PHỐI ═══
┌─────────────────▼───────────────────────────┐
│ Supervisor.think(Fast LLM):                 │
│   "Subtask 1 → Worker-1 (file handling)    │
│    Subtask 2 → chờ ST1 xong                │
│    Subtask 3 → chờ ST2 xong"              │
└─────┬───────────────────────────────────────┘
      │
═══ PHASE 3: WORKERS THỰC THI ═══
      │
      ├──→ Worker-1.think() → read_file_content() → ✓ Nội dung
      │         │
      │    ┌────▼────┐
      │    │Subtask 1│ DONE → kết quả chuyển Subtask 2
      │    └─────────┘
      │
      ├──→ Worker-2.think() → phân tích nội dung → ✓ 3 điểm chính
      │         │
      │    ┌────▼────┐
      │    │Subtask 2│ DONE → kết quả chuyển Subtask 3
      │    └─────────┘
      │
      └──→ Worker-3.think() → create_workflow() → ✓ Quy trình tạo
                │
           ┌────▼────┐
           │Subtask 3│ DONE
           └─────────┘

═══ PHASE 4: COMMANDER TỔNG HỢP ═══
┌─────────────────────────────────────────────┐
│ Commander.think(Strong LLM):                │
│   "Tất cả subtask xong. Tổng hợp:         │
│    - 3 điểm chính của cẩm nang             │
│    - Quy trình onboarding đã tạo           │
│    → Response cho user"                     │
└─────────────────────────────────────────────┘
```

### Self-Learning Flow

```
Lần 1: User hỏi "cẩm nang sale có gì?"
  ├── Knowledge Base: trống
  ├── Commander → read_file_content() → phân tích → response
  ├── ✓ Lưu knowledge: {Q: "cẩm nang sale", tools: read_file, answer: "..."}
  └── Thời gian: ~8s

Lần 2: User khác hỏi "cho xem nội dung cẩm nang"
  ├── Knowledge Base: match score 0.67 → HIT!
  ├── Commander dùng knowledge context → response (ít/không tool call)
  └── Thời gian: ~2s (nhanh gấp 4x)
```

---

## Agent System

### Agent Template (Dynamic)

Agent không hardcode — admin tạo template qua chat, spawn runtime:

```
Admin: "tạo template Sales Analyst chuyên phân tích file"

→ create_agent_template({
    name: "Sales Analyst",
    role: "worker",
    system_prompt: "Bạn chuyên phân tích tài liệu bán hàng...",
    capabilities: ["file_analysis", "summarize"],
    tools: ["read_file_content", "save_knowledge"],
    engine: "fast-api",
    max_concurrent_tasks: 3
  })

Admin: "spawn 2 con Sales Analyst"

→ spawn_agent({ template_name: "Sales Analyst", count: 2 })
→ Worker-SA-1 + Worker-SA-2 khởi tạo, sẵn sàng nhận task
```

### Agent Tools

| Tool | Mô tả |
|------|--------|
| `create_agent_template` | Tạo job description mới |
| `list_agent_templates` | Xem templates |
| `spawn_agent` | Tạo agent từ template |
| `kill_agent` | Tắt agent |
| `list_agents` | Xem agents đang chạy |

### Quản lý Agent — Commander tự quản lý

```
Commander phát hiện:
  "Worker-2 fail 3 task liên tiếp, performance 0.3"
  → kill_agent(Worker-2)
  → spawn_agent(template: "Sales Analyst")  ← thay thế

Commander phát hiện:
  "Queue quá tải, 20 tasks pending"
  → spawn_agent(template: "Worker", count: 3)  ← scale up

Commander phát hiện:
  "Chỉ 2 tasks pending, 5 workers idle"
  → kill_agent(Worker-4)
  → kill_agent(Worker-5)  ← scale down
```

---

## Pipeline chi tiết

### Progress Messages (UX)

```
User nhắn → Bot hiện:

  ⏳ Đang xử lý...
  → 🔍 Đang tìm kiếm kiến thức...
  → 🤖 Commander đang suy nghĩ...
  → 📖 Đang đọc nội dung file...
  → ✍️ Đang tổng hợp câu trả lời...
  → [Kết quả đầy đủ]

Tất cả edit cùng 1 message, không spam.
```

### Message Queue

```
10 users nhắn cùng lúc:

  ┌─────────────────────────────────┐
  │ Queue: [msg1, msg2, ..., msg10] │
  │ Concurrency: 5                  │
  │ Priority: admin(1) > user(5)    │
  └─────────────┬───────────────────┘
                │
  ┌─────────────▼───────────────────┐
  │ Worker 1: msg1 (admin) ← first │
  │ Worker 2: msg2                  │
  │ Worker 3: msg3                  │
  │ Worker 4: msg4                  │
  │ Worker 5: msg5                  │
  │ ── waiting ──                   │
  │ msg6..10 chờ worker rảnh        │
  └─────────────────────────────────┘

  Tổng: ~6s cho 10 messages (thay vì ~30s sequential)
```

---

## Modules

```
src/modules/
  ├── agents/           Agent registration, templates, pool, runner
  ├── hierarchy/        Closure table, authorization matrix
  ├── tasks/            Task lifecycle (pending → assigned → done)
  ├── orchestration/    Decomposer, DAG executor, decision engine
  ├── messaging/        Inter-agent communication
  ├── decisions/        Audit trail
  ├── monitoring/       Suspend, kill, budget enforcement
  ├── knowledge/        Store, retrieve, vote, self-learning
  ├── workflows/        Workflow engine, form engine, rules engine
  ├── tenants/          Multi-tenant management
  ├── integrations/     Telegram, webhook, email connectors
  ├── conversations/    Chat session management
  ├── logs/             Structured task logging
  ├── notebooks/        Key-value store for agent data
  ├── analytics/        Metrics, cost reports, performance
  └── storage/          S3 file handling + content extraction
```

---

## MCP Tools (66)

### Business Tools

| # | Tool | Args | Mô tả |
|---|------|------|--------|
| 1 | `list_workflows` | - | Xem quy trình |
| 2 | `create_workflow` | name, stages[] | Tạo quy trình |
| 3 | `create_form` | name, fields[] | Tạo form |
| 4 | `create_rule` | name, conditions, actions | Tạo business rule |
| 5 | `save_tutorial` | title, content, target_role | Lưu tutorial |
| 6 | `save_knowledge` | type, title, content, tags | Lưu kiến thức |
| 7 | `list_files` | limit? | Xem files đã upload |
| 8 | `read_file_content` | file_id | Đọc nội dung DOCX/TXT/CSV |
| 9 | `get_file` | file_id | Metadata file |
| 10 | `send_file` | file_id | Gửi file cho user |
| 11 | `search_knowledge` | domain?, tags? | Tìm kiến thức |

### Agent Management Tools

| # | Tool | Args | Mô tả |
|---|------|------|--------|
| 12 | `create_agent_template` | name, role, prompt, tools | Tạo template |
| 13 | `list_agent_templates` | role?, status? | Xem templates |
| 14 | `spawn_agent` | template_id/name, count | Tạo agent |
| 15 | `kill_agent` | agent_id | Tắt agent |
| 16 | `list_agents` | role?, status? | Xem agents |

### User Management Tools

| # | Tool | Args | Mô tả |
|---|------|------|--------|
| 17 | `list_users` | - | Xem users |
| 18 | `set_user_role` | channel_user_id, role | Đổi role |
| 19 | `get_dashboard` | - | Dashboard hệ thống |

### Task & Orchestration Tools (via MCP Server)

| Category | Count | Tools |
|----------|-------|-------|
| Task | 8 | list, get, create, claim, start, complete, fail, cancel |
| Hierarchy | 5 | set_parent, promote, get_subordinates, chain_of_command, tree |
| Orchestration | 5 | decompose, execute_plan, plan_status, delegate, auto_assign |
| Messaging | 4 | send, check, acknowledge, broadcast |
| Monitoring | 3 | suspend, kill, set_budget |
| Knowledge | 5 | store, query, vote, get, supersede |
| Notebook | 4 | write, read, list, delete |
| Analytics | 2 | task_metrics, cost_report |
| Workflow | 7 | create/get/list/update template, start/get instance, submit_form |
| Rules | 3 | create, evaluate, list |
| Tenant | 3 | create, get, update |
| Integration | 3 | create, test, list |
| Conversation | 1 | handle_chat_message |
| Log | 2 | write, get |

---

## Database (22 tables)

```
┌─────────────────────────────────────────────────────────┐
│                     Database Schema                      │
│                                                          │
│  ┌─────────────────┐     ┌──────────────────────────┐   │
│  │ Agent Mgmt (3)  │     │ Task Mgmt (3)            │   │
│  │ ─────────────── │     │ ──────────────────────── │   │
│  │ agents          │◄───►│ tasks                    │   │
│  │ agent_templates │     │ task_dependencies        │   │
│  │ agent_hierarchy │     │ task_logs                │   │
│  └─────────────────┘     └──────────────────────────┘   │
│                                                          │
│  ┌─────────────────┐     ┌──────────────────────────┐   │
│  │ Orchestr. (3)   │     │ Knowledge (3)            │   │
│  │ ─────────────── │     │ ──────────────────────── │   │
│  │ messages        │     │ knowledge_entries        │   │
│  │ decisions       │     │ knowledge_votes          │   │
│  │ execution_plans │     │ knowledge_applications   │   │
│  └─────────────────┘     └──────────────────────────┘   │
│                                                          │
│  ┌─────────────────┐     ┌──────────────────────────┐   │
│  │ Tenant (2)      │     │ Workflow (5)             │   │
│  │ ─────────────── │     │ ──────────────────────── │   │
│  │ tenants         │     │ workflow_templates       │   │
│  │ tenant_users    │     │ form_templates           │   │
│  └─────────────────┘     │ business_rules           │   │
│                          │ workflow_instances       │   │
│  ┌─────────────────┐     │ workflow_approvals       │   │
│  │ Storage (3)     │     └──────────────────────────┘   │
│  │ ─────────────── │                                    │
│  │ notebooks       │     ┌──────────────────────────┐   │
│  │ token_usage     │     │ Integration (2)          │   │
│  │ files           │     │ ──────────────────────── │   │
│  └─────────────────┘     │ integrations             │   │
│                          │ conversation_sessions    │   │
│                          └──────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Telegram Bot

### Commands

| Command | Quyền | Mô tả |
|---------|--------|--------|
| `/start` | Public | Kiểm tra đăng ký, hiện menu |
| `/register` | Public | Đăng ký tài khoản (cần admin duyệt) |
| `/pending` | Admin | Xem danh sách chờ duyệt |
| `/approve <id>` | Admin | Duyệt user |
| `/reject <id>` | Admin | Từ chối user |
| `/workflows` | User+ | Xem quy trình |
| `/new_<id>` | User+ | Bắt đầu quy trình |

### Access Control

```
User nhắn bot
  │
  ├── Có trong DB + is_active=1? → Cho phép, xử lý bình thường
  │
  ├── Có trong DB + is_active=0? → "Đang chờ duyệt"
  │
  └── Không có trong DB? → "Bạn chưa có quyền. Gõ /register"
```

### File Upload

```
User gửi file (PDF, DOCX, ảnh...)
  → Stream download từ Telegram (không load RAM)
  → Upload S3: openclaw/{tenant}/{month}/{ulid}.ext
  → Metadata lưu DB (tên, size, type, uploader)
  → Bot xác nhận: "📎 Đã nhận file_name (12KB)"
  → User hỏi "phân tích file" → read_file_content → trả lời
```

---

## Triển khai

### Yêu cầu

- **Node.js** >= 22
- **npm** >= 10
- **Claude Code CLI** (optional, cho Commander brain)
- **S3 storage** (optional, cho file upload)

### Local Development

```bash
# 1. Clone
git clone https://github.com/TungND2k2/OpenClow.git
cd OpenClow

# 2. Install
npm install

# 3. Config
cp .env.example .env
# Sửa .env: thêm TELEGRAM_BOT_TOKEN, API keys

# 4. Setup demo data
npx tsx scripts/setup-demo.ts <YOUR_TELEGRAM_ID>
# Copy TELEGRAM_DEFAULT_TENANT_ID vào .env

# 5. Run
npx tsx src/index.ts
```

### Production (Ubuntu Server)

```bash
# 1. Cài Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# 2. Clone + Install
cd /opt
git clone https://github.com/TungND2k2/OpenClow.git
cd OpenClow
npm install

# 3. Config
cp .env.example .env
nano .env  # Thêm tokens, API keys

# 4. Setup
npx tsx scripts/setup-demo.ts <YOUR_TELEGRAM_ID>
# Copy TELEGRAM_DEFAULT_TENANT_ID vào .env

# 5. PM2 (process manager)
npm install -g pm2
pm2 start "npx tsx src/index.ts" --name openclaw
pm2 save
pm2 startup  # auto-start on reboot

# 6. Monitoring
pm2 logs openclaw          # Xem logs
pm2 monit                  # Dashboard
pm2 restart openclaw       # Restart
```

### Deploy Update

```bash
cd /opt/OpenClow
git pull
npm install            # nếu có package mới
pm2 restart openclaw
```

---

## Cấu hình

### .env

```env
# ── Database ──────────────────────────
DATABASE_URL=./data/openclaw.db

# ── Server ────────────────────────────
NODE_ENV=development          # development | production
LOG_LEVEL=info                # debug | info | warn | error

# ── Orchestrator ──────────────────────
ORCHESTRATOR_TICK_MS=5000     # Tick interval (ms)
HEARTBEAT_TIMEOUT_MS=30000    # Agent timeout

# ── LLM Proxy ────────────────────────
PROXY_PORT=3101

# Commander (strong model)
COMMANDER_API_BASE=               # API endpoint
COMMANDER_API_KEY=                # API key
COMMANDER_MODEL=                  # Model name

# Workers (fast/cheap model)
WORKER_API_BASE=                  # OpenAI-compatible endpoint
WORKER_API_KEY=                   # API key
WORKER_MODEL=                     # Model name

# ── Telegram ──────────────────────────
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_DEFAULT_TENANT_ID=   # từ setup-demo

# ── S3 Storage (optional) ────────────
S3_ENDPOINT=https://s3.example.com
S3_REGION=us-east-1
S3_BUCKET=your-bucket
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 + TypeScript |
| Database | SQLite (WAL mode) + Drizzle ORM |
| MCP | @modelcontextprotocol/sdk |
| LLM | Any OpenAI-compatible / Anthropic API |
| Bot | Telegram Bot API (long-polling) |
| Storage | S3-compatible (AWS, MinIO, Cloudflare R2) |
| IDs | ULID (sortable, no collision) |
| Validation | Zod |
| Process | PM2 |
| Testing | Vitest |

---

## License

Private — OpenClaw by TungND2k2
