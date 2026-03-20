# OpenClaw Architecture

## Tổng quan

OpenClaw là hệ thống **local-first, hierarchical multi-agent orchestration** để điều phối nhiều AI agent hoạt động semi-autonomous. Lấy cảm hứng từ cấu trúc chỉ huy quân sự (C2) và Kubernetes scheduling.

### Thành phần chính:
- **Agent Hierarchy** — Hệ thống phân cấp agent: Commander → Supervisor → Specialist → Worker
- **Orchestration Engine** — Bộ não tự động: phân rã task, giao việc, retry, escalation
- **ClawTask** — Module quản lý task dạng DAG (Directed Acyclic Graph) với dependencies
- **MCP Layer** — Giao diện chuẩn MCP để mọi agent tương tác với hệ thống
- **Messaging** — Giao tiếp giữa các agent: command, report, request, escalation
- **Proxy API** — Proxy LLM API để tracking token, budget enforcement, cost optimization

---

## Tech Stack

| Component | Lựa chọn | Lý do |
|---|---|---|
| Language | TypeScript (Node.js) | MCP SDK là TypeScript-first, type-safe toàn bộ stack |
| Database | SQLite (better-sqlite3 + Drizzle ORM) | Local-first, zero-config, concurrent qua WAL mode |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK, tích hợp Zod validation |
| Transport | stdio (chính) + Streamable HTTP (phụ) | stdio cho CLI/IDE, HTTP cho dashboard/remote |
| ID | ULID | Sortable theo thời gian, không collision |
| Validation | Zod | Peer dependency của MCP SDK, dùng chung cho toàn bộ |
| Testing | Vitest | Nhanh, native TypeScript support |

---

## 1. Hệ thống phân cấp Agent (Agent Hierarchy)

### 1.1 Các cấp bậc (Ranks)

```
┌─────────────────────────────────────────────────┐
│                  COMMANDER                       │
│  (Tổng chỉ huy — chỉ có 1 active tại mọi lúc)  │
│  Nhận goal từ human → phân rã → điều phối        │
└──────────┬──────────────────────┬───────────────┘
           │                      │
  ┌────────▼────────┐   ┌────────▼────────┐
  │   SUPERVISOR    │   │   SUPERVISOR    │
  │  (Quản lý nhóm) │   │  (Quản lý nhóm) │
  │  Max 10 agents  │   │  Max 10 agents  │
  └───┬─────────┬───┘   └───┬─────────┬───┘
      │         │            │         │
  ┌───▼───┐ ┌──▼────┐  ┌───▼───┐ ┌──▼────┐
  │SPECIAL│ │WORKER │  │SPECIAL│ │WORKER │
  │ IST   │ │       │  │ IST   │ │       │
  └───────┘ └───────┘  └───────┘ └───────┘
```

| Rank | Authority | Max Subordinates | Tạo Task | Giao Task | Spawn Agent |
|------|-----------|-----------------|----------|-----------|-------------|
| **Commander** | 4 | Unlimited | Top-level + subtask | Cho bất kỳ ai | Yes |
| **Supervisor** | 3 | 10 | Subtask only | Cho subordinates | No |
| **Specialist** | 2 | 0 | Own subtask only | No | No |
| **Worker** | 1 | 0 | No | No | No |

**Commander** — Duy nhất 1 active. Nhận goal cấp cao từ human, phân rã thành task DAG, giao cho supervisors. Có global context visibility. Tương tự: Tướng / CEO.

**Supervisor** — Quản lý tầm trung. Nhận subtree tasks từ Commander, phân rã tiếp nếu cần, giao cho specialists/workers, giám sát tiến độ trong scope. Tương tự: Đại tá / VP.

**Specialist** — Chuyên gia domain (vd: "database-specialist", "frontend-specialist"). Chỉ nhận task match capabilities. Có thể tự phân rã task thành private sub-steps. Tương tự: Trung sĩ / Senior Engineer.

**Worker** — Thực thi chung. Nhận task, thực hiện, báo cáo. Tương tự: Binh nhất / Junior Engineer.

### 1.2 Thăng cấp & Phân quyền

Roles được assign khi đăng ký, chỉ Commander hoặc human mới thay đổi được:

```
worker → specialist:    Commander approval + capability_score > 0.8
specialist → supervisor: Commander approval + tasks_completed > 20
supervisor → commander:  Human approval ONLY (không bao giờ auto)
Giáng cấp:              Commander hoặc human bất kỳ lúc nào
```

### 1.3 Ma trận quyền hạn (Permission Matrix)

| Action | Commander | Supervisor | Specialist | Worker |
|--------|-----------|-----------|-----------|--------|
| create_task (top-level) | Yes | No | No | No |
| create_task (subtask of own) | Yes | Yes | Yes | No |
| assign_task (to subordinate) | Yes | Yes | No | No |
| reassign_task | Yes | Own subtree | No | No |
| cancel_task | Any | Own subtree | Own only | No |
| read global context | Yes | No | No | No |
| read subtree context | Yes | Own subtree | Own task | Own task |
| spawn_agent | Yes | No | No | No |
| kill_agent | Yes | No | No | No |
| promote_agent | Yes | No | No | No |
| set_budget | Yes | Own subtree | No | No |
| send_message (down) | Yes | Yes | No | No |
| send_message (up/report) | Yes | Yes | Yes | Yes |
| broadcast | Yes | Own subtree | No | No |

---

## 2. Data Models

### 2.1 agents

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| name | TEXT | Human-readable name |
| role | TEXT | `commander` / `supervisor` / `specialist` / `worker` |
| authority_level | INTEGER | 1-4, derived from role |
| capabilities | TEXT (JSON) | `["code-review", "database", "testing", ...]` |
| parent_agent_id | TEXT | FK → agents, nullable (ai là sếp?) |
| status | TEXT | `registering` / `idle` / `busy` / `suspended` / `offline` / `deactivated` |
| performance_score | REAL | 0.0 → 1.0, rolling average |
| tasks_completed | INTEGER | Counter |
| tasks_failed | INTEGER | Counter |
| max_concurrent_tasks | INTEGER | Default 1 |
| cost_budget_usd | REAL | Spending limit, NULL = unlimited |
| cost_spent_usd | REAL | Đã chi |
| config | TEXT (JSON) | Agent-specific configuration |
| last_heartbeat | INTEGER | Unix ms |
| created_at | INTEGER | |
| updated_at | INTEGER | |

### 2.2 agent_hierarchy (Closure Table)

Dùng closure table pattern để query subtree nhanh O(1) thay vì recursive CTE.

| Column | Type | Notes |
|---|---|---|
| ancestor_id | TEXT | FK → agents |
| descendant_id | TEXT | FK → agents |
| depth | INTEGER | 0 = self, 1 = direct child, 2 = grandchild... |

> PK: `(ancestor_id, descendant_id)`
> Query "tất cả agent dưới quyền Supervisor X" = 1 indexed lookup.

### 2.3 tasks

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| title | TEXT | Short description |
| description | TEXT | Full specification |
| status | TEXT | `pending` / `assigned` / `in_progress` / `delegated` / `blocked` / `completed` / `failed` / `cancelled` |
| priority | INTEGER | 1 (low) → 5 (critical) |
| urgency | INTEGER | 1-5 (tách biệt priority — Eisenhower matrix) |
| assigned_agent_id | TEXT | FK → agents, nullable |
| created_by_agent_id | TEXT | FK → agents, nullable (ai tạo?) |
| delegated_by_agent_id | TEXT | FK → agents, nullable (ai giao?) |
| parent_task_id | TEXT | FK → tasks, nullable |
| execution_strategy | TEXT | `sequential` / `parallel` / `pipeline` / `swarm` |
| dependency_ids | TEXT (JSON) | `[task_id, ...]` phải hoàn thành trước |
| depth | INTEGER | 0 = root goal, 1 = first decomposition... |
| max_depth | INTEGER | Default 5 (chống infinite decomposition) |
| retry_count | INTEGER | Default 0 |
| max_retries | INTEGER | Default 3 |
| escalation_agent_id | TEXT | FK → agents, nullable (escalate đến ai?) |
| required_capabilities | TEXT (JSON) | Capabilities cần để thực thi |
| estimated_duration_ms | INTEGER | nullable |
| cost_budget_usd | REAL | nullable |
| cost_spent_usd | REAL | Default 0.0 |
| tags | TEXT (JSON) | |
| result | TEXT | nullable |
| error | TEXT | nullable |
| created_at | INTEGER | |
| assigned_at | INTEGER | nullable |
| started_at | INTEGER | nullable |
| completed_at | INTEGER | nullable |
| deadline | INTEGER | nullable |

### 2.4 task_dependencies (DAG edges)

| Column | Type | Notes |
|---|---|---|
| task_id | TEXT | FK → tasks (task phụ thuộc) |
| depends_on_id | TEXT | FK → tasks (task tiên quyết) |
| status | TEXT | `pending` / `satisfied` / `failed` |

> PK: `(task_id, depends_on_id)`

### 2.5 task_logs

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| task_id | TEXT | FK → tasks |
| agent_id | TEXT | FK → agents |
| level | TEXT | `debug` / `info` / `warn` / `error` |
| message | TEXT | Log message |
| metadata | TEXT (JSON) | Arbitrary structured data |
| created_at | INTEGER | |

### 2.6 messages (Inter-agent communication)

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| type | TEXT | `command` / `report` / `request` / `broadcast` / `escalation` / `coordination` |
| from_agent_id | TEXT | FK → agents |
| to_agent_id | TEXT | FK → agents, nullable (NULL cho broadcast) |
| task_id | TEXT | FK → tasks, nullable |
| priority | INTEGER | Default 3 |
| payload | TEXT (JSON) | Structured message body |
| status | TEXT | `pending` / `delivered` / `acknowledged` / `expired` |
| expires_at | INTEGER | nullable |
| created_at | INTEGER | |
| delivered_at | INTEGER | nullable |
| acknowledged_at | INTEGER | nullable |

### 2.7 decisions (Audit trail)

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| agent_id | TEXT | FK → agents (ai quyết định?) |
| decision_type | TEXT | `decompose` / `assign` / `reassign` / `retry` / `escalate` / `cancel` / `promote` / `demote` / `spawn` / `kill` |
| task_id | TEXT | FK → tasks, nullable |
| target_agent_id | TEXT | FK → agents, nullable |
| reasoning | TEXT | Tại sao quyết định này (LLM explanation) |
| input_context | TEXT (JSON) | Data đã dùng để ra quyết định |
| outcome | TEXT | Kết quả, nullable |
| created_at | INTEGER | |

### 2.8 execution_plans (DAG definitions)

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| root_task_id | TEXT | FK → tasks (goal mà plan phục vụ) |
| created_by_agent_id | TEXT | FK → agents |
| strategy | TEXT | `sequential` / `parallel` / `pipeline` / `mixed` |
| plan_graph | TEXT (JSON) | Serialized DAG: `{ nodes: [...], edges: [...] }` |
| status | TEXT | `draft` / `active` / `completed` / `failed` / `cancelled` |
| created_at | INTEGER | |
| updated_at | INTEGER | |

### 2.9 notebooks

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| namespace | TEXT | Grouping key |
| key | TEXT | Lookup key within namespace |
| value | TEXT | Content (markdown, JSON, plain text) |
| content_type | TEXT | `text/markdown` / `application/json` / `text/plain` |
| created_by_agent_id | TEXT | FK → agents, nullable |
| created_at | INTEGER | |
| updated_at | INTEGER | |

> Unique constraint: `(namespace, key)`

### 2.10 token_usage

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| agent_id | TEXT | FK → agents |
| task_id | TEXT | FK → tasks, nullable |
| model | TEXT | e.g. `claude-sonnet-4-20250514` |
| input_tokens | INTEGER | |
| output_tokens | INTEGER | |
| cost_usd | REAL | |
| created_at | INTEGER | |

---

## 3. Task Lifecycle (mở rộng)

### 3.1 State Machine

```
                    ┌──────────────────────────┐
                    │         PENDING           │
                    │   (human/Commander tạo)   │
                    └────────────┬──────────────┘
                                 │
              Commander/Supervisor assigns / agent claims
                                 │
                    ┌────────────▼──────────────┐
                    │        ASSIGNED           │
                    │   (agent_id set)          │
                    └────────────┬──────────────┘
                                 │
                    agent gọi start_task
                                 │
          ┌─────────────────────▼──────────────────────┐
          │              IN_PROGRESS                     │
          │  agent writes logs, saves to notebooks       │
          │                                              │
          │  ┌─── DELEGATED (nếu phân rã subtasks) ──┐  │
          │  │  chờ tất cả subtasks hoàn thành        │  │
          │  └────────────────────────────────────────┘  │
          │                                              │
          │  ┌─── BLOCKED (nếu dependency fail) ──────┐  │
          │  │  chờ escalation hoặc human intervention │  │
          │  └────────────────────────────────────────┘  │
          └──────┬───────────────────────┬──────────────┘
                 │                       │
         success │                       │ failure
                 │                       │
    ┌────────────▼────┐    ┌────────────▼─────────────┐
    │   COMPLETED     │    │        FAILED             │
    │   (result set)  │    │   (error set)             │
    └─────────────────┘    └────────────┬──────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │      RETRY / ESCALATE       │
                         │  retry_count < max_retries?  │
                         │  → reset to PENDING          │
                         │  → hoặc reassign agent khác  │
                         │  → hoặc escalate lên trên    │
                         └─────────────────────────────┘
```

### 3.2 Transition Rules

| From | To | Điều kiện |
|------|----|-----------|
| `pending` | `assigned` | Commander/Supervisor assign hoặc agent claim |
| `pending` | `cancelled` | Commander/human cancel |
| `assigned` | `in_progress` | Assigned agent gọi start_task |
| `assigned` | `cancelled` | Commander/delegator cancel |
| `in_progress` | `delegated` | Agent phân rã thành subtasks |
| `in_progress` | `completed` | Agent báo hoàn thành |
| `in_progress` | `failed` | Agent báo lỗi |
| `in_progress` | `cancelled` | Commander/delegator cancel |
| `delegated` | `completed` | Tất cả subtasks completed (auto-rollup) |
| `delegated` | `blocked` | Critical subtask failed beyond retries |
| `blocked` | `pending` | Escalation agent re-decomposes |
| `failed` | `pending` | Retry (retry_count < max_retries) |

### 3.3 Failure Handling Flow

```
Task FAILED
    │
    ▼
retry_count < max_retries?
    │
    ├── YES → reset to PENDING
    │         increment retry_count
    │         optionally reassign to different agent
    │         log decision to decisions table
    │
    └── NO → escalation_agent_id set?
              │
              ├── YES → send escalation message
              │         escalation agent re-decomposes hoặc take over
              │
              └── NO → mark parent task as BLOCKED
                       propagate failure up the chain
                       Commander makes final decision
```

---

## 4. Task Decomposition & Delegation

### 4.1 Decomposition Algorithm (Commander's brain)

```
FUNCTION decompose(goal_task):
  1. Commander đọc goal_task.description
  2. Commander đọc available agents + capabilities (via list_agents)
  3. Commander gọi LLM với prompt:
     "Given this goal: {description}
      Available agents: {agent_list_with_capabilities}
      Break this into subtasks. For each:
        - title, description
        - required_capabilities
        - dependencies (subtasks nào phải xong trước)
        - estimated_duration
        - execution_strategy for the group"
  4. LLM trả về structured plan
  5. Commander gọi create_execution_plan tool
  6. System tạo subtask records + dependency edges
  7. Commander gọi delegate_task cho mỗi subtask không có unmet dependencies
```

### 4.2 Decision Engine — Agent Selection

```
FUNCTION select_agent(task, candidate_agents):
  FOR each candidate:
    capability_match = jaccard(task.required_capabilities, agent.capabilities)
    IF capability_match == 0: SKIP

    load_factor = agent.active_tasks / agent.max_concurrent_tasks
    availability = 1.0 - load_factor

    performance = agent.performance_score

    cost_efficiency = 1.0 - (agent.cost_spent / agent.cost_budget)

    score = capability_match * 0.4
          + availability     * 0.3
          + performance      * 0.2
          + cost_efficiency  * 0.1

  RETURN agent có score cao nhất
```

### 4.3 Execution Strategies

| Strategy | Mô tả | Implementation |
|----------|--------|---------------|
| **Sequential** | Task N+1 chỉ bắt đầu khi N xong | `dependency_ids` trỏ đến task trước |
| **Parallel** | Tất cả subtasks chạy đồng thời | Không có inter-dependencies |
| **Pipeline** | Output task N = input task N+1 | `result` của N inject vào `description` của N+1 qua `{{previous_result}}` |
| **Swarm** | Nhiều agent cộng tác trên 1 task | Tạo N subtasks giống nhau, share notebook namespace `swarm:{task_id}` |
| **Mixed** | Kết hợp tất cả | DAG plan_graph với strategy annotations per sub-group |

---

## 5. Agent Communication Protocol

### 5.1 Message Types

| Type | Direction | Purpose | Payload |
|------|-----------|---------|---------|
| `command` | Down (sếp → lính) | Ra lệnh | `{ action, task_id, parameters }` |
| `report` | Up (lính → sếp) | Báo cáo | `{ task_id, status, progress_pct, details }` |
| `request` | Up (lính → sếp) | Xin help/resources | `{ request_type, task_id, details }` |
| `broadcast` | Lateral (to all) | Thông báo | `{ topic, content }` |
| `escalation` | Up (skip levels) | Urgent failure | `{ task_id, error, attempted_remedies }` |
| `coordination` | Lateral (peer) | Swarm collab | `{ task_id, shared_state, action }` |

### 5.2 Message Flow

Pull-based model (phù hợp MCP stdio transport — không thể push):
- Agent gọi `check_messages` → nhận pending messages theo priority + created_at
- HTTP transport: thêm SSE notification khi có message mới → agent poll ngay

### 5.3 Status Propagation (tự động)

Khi subtask thay đổi status:
1. Update task record
2. Check `task_dependencies` → mark satisfied nếu prerequisite completed
3. Check blocked tasks → nếu tất cả deps satisfied → transition to `pending`
4. Send `report` message lên delegating agent
5. Nếu tất cả subtasks completed → auto-complete parent (rollup)
6. Nếu critical subtask failed + hết retries → mark parent `blocked`

---

## 6. Agent Lifecycle

```
                           human / Commander
                           gọi register_agent
                                  │
                    ┌─────────────▼──────────────┐
                    │       REGISTERING           │
                    │  (capabilities assessed)    │
                    └─────────────┬──────────────┘
                                  │
                    Commander assign role + parent
                                  │
                    ┌─────────────▼──────────────┐
                    │          IDLE               │◄────── task completed
                    │  (sẵn sàng nhận task)       │        (return idle)
                    └─────────┬──────────┬───────┘
                              │          │
                    assigned  │          │ no heartbeat
                    task      │          │ > threshold
                              │          │
                    ┌─────────▼────┐  ┌──▼──────────────┐
                    │    BUSY      │  │    OFFLINE       │
                    │  (working)   │  │  (presumed dead) │
                    └──────────────┘  └──┬──────────────┘
                                         │
                           heartbeat     │   Commander decision
                           resumes       │   hoặc timeout
                             │           │
                             ▼           ▼
                           IDLE    ┌──────────────┐
                                   │ DEACTIVATED  │
                                   │  (removed)   │
                                   └──────────────┘

    Special state:
    ┌──────────────┐
    │  SUSPENDED   │  ← Commander suspend bất kỳ agent (kill switch)
    │  (frozen)    │    Tasks bị reassign, agent không thể act
    └──────────────┘
```

**Heartbeat monitoring**: Orchestrator tick kiểm tra `now - last_heartbeat > TIMEOUT`. Agent miss heartbeat → `offline`. Tasks bị reassign.

**Performance scoring** (exponential moving average):
```
new_score = old_score * 0.9 + (task_success ? 0.1 : 0.0)
```

---

## 7. Memory & Context Sharing (Notebook Namespaces)

| Namespace Pattern | Purpose | Access |
|-------------------|---------|--------|
| `global:*` | System-wide knowledge | Commander read/write, all read |
| `team:{supervisor_id}:*` | Team-level shared state | Supervisor + subordinates |
| `task:{task_id}:*` | Task-specific working memory | Assigned agent + ancestors |
| `agent:{agent_id}:private:*` | Agent's private scratchpad | Only agent itself |
| `swarm:{task_id}:*` | Swarm collaboration space | All agents in swarm |

Access control enforced bởi hierarchy position check trong `notebook.service.ts`.

---

## 8. Orchestrator Loop (Bộ não tự động)

Chạy mỗi `ORCHESTRATOR_TICK_MS` (default 5000ms):

```
TICK():
  ┌─── 1. HEALTH CHECK ──────────────────────────────────┐
  │  Query agents: now - last_heartbeat > TIMEOUT         │
  │  → Mark offline                                       │
  │  → Reassign in-progress tasks                         │
  │  → Log decision                                       │
  └───────────────────────────────────────────────────────┘
                          │
  ┌─── 2. DEPENDENCY RESOLUTION ──────────────────────────┐
  │  Query task_dependencies: depends_on completed?        │
  │  → Mark satisfied                                      │
  │  → Tasks với ALL deps satisfied → transition to pending│
  └───────────────────────────────────────────────────────┘
                          │
  ┌─── 3. PENDING TASK ASSIGNMENT ────────────────────────┐
  │  Query pending tasks ORDER BY priority, urgency, age   │
  │  FOR each:                                             │
  │    → Find suitable agents (capability + available)     │
  │    → Run decision engine scoring                       │
  │    → Match found? → assign + send command message      │
  │    → No match? → leave pending (retry next tick)       │
  │    → Record decision                                   │
  └───────────────────────────────────────────────────────┘
                          │
  ┌─── 4. PROGRESS ROLLUP ───────────────────────────────┐
  │  FOR parent tasks with children:                      │
  │    → All completed? → auto-complete parent            │
  │    → Any failed beyond retries? → escalate/block      │
  │    → Pipeline? → check next stage ready               │
  └───────────────────────────────────────────────────────┘
                          │
  ┌─── 5. BUDGET CHECK ──────────────────────────────────┐
  │  Query agents: cost_spent > cost_budget               │
  │  → Suspend over-budget agents                         │
  │  → Reassign their tasks                               │
  └───────────────────────────────────────────────────────┘
                          │
  ┌─── 6. STALE TASK CHECK ──────────────────────────────┐
  │  Query in_progress: now - started_at > estimated * 2  │
  │  → Send warning message to agent                      │
  │  → No response after next tick? → consider reassign   │
  └───────────────────────────────────────────────────────┘
```

---

## 9. Cấu trúc thư mục

```
OpenClaw/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.example
│
├── src/
│   ├── index.ts                          # Entry point
│   ├── config.ts                         # Zod-validated env config
│   │
│   ├── db/
│   │   ├── connection.ts                 # SQLite singleton, WAL mode
│   │   ├── schema.ts                    # ALL table definitions (source of truth)
│   │   └── migrate.ts                   # Auto-run migrations on startup
│   │
│   ├── modules/
│   │   ├── tasks/
│   │   │   ├── task.service.ts           # CRUD + lifecycle state machine
│   │   │   ├── task.queries.ts           # Drizzle query helpers
│   │   │   └── task.types.ts
│   │   │
│   │   ├── agents/
│   │   │   ├── agent.service.ts          # Registration, heartbeat, roles, performance
│   │   │   └── agent.queries.ts
│   │   │
│   │   ├── hierarchy/                    # Agent phân cấp
│   │   │   ├── hierarchy.service.ts      # Closure table ops, subtree queries
│   │   │   ├── hierarchy.queries.ts
│   │   │   ├── authorization.ts          # Permission matrix enforcement
│   │   │   └── hierarchy.types.ts
│   │   │
│   │   ├── orchestration/                # Bộ não tự động
│   │   │   ├── orchestrator.service.ts   # Main tick loop
│   │   │   ├── decision-engine.ts        # Agent scoring, retry, escalation
│   │   │   ├── decomposer.ts            # LLM-powered task decomposition
│   │   │   ├── dag-executor.ts          # DAG walking, dependency resolution
│   │   │   ├── strategies/
│   │   │   │   ├── sequential.strategy.ts
│   │   │   │   ├── parallel.strategy.ts
│   │   │   │   ├── pipeline.strategy.ts
│   │   │   │   └── swarm.strategy.ts
│   │   │   └── orchestration.types.ts
│   │   │
│   │   ├── messaging/                    # Giao tiếp inter-agent
│   │   │   ├── message.service.ts        # Send, poll, acknowledge, broadcast
│   │   │   ├── message.queries.ts
│   │   │   └── message.types.ts
│   │   │
│   │   ├── decisions/                    # Audit trail
│   │   │   ├── decision.service.ts       # Record + query decisions
│   │   │   └── decision.queries.ts
│   │   │
│   │   ├── logs/
│   │   │   ├── log.service.ts
│   │   │   └── log.queries.ts
│   │   │
│   │   ├── notebooks/
│   │   │   ├── notebook.service.ts       # Namespaced key-value + access control
│   │   │   └── notebook.queries.ts
│   │   │
│   │   ├── monitoring/                   # Giám sát hệ thống
│   │   │   ├── monitor.service.ts        # Heartbeat check, stale detection
│   │   │   ├── budget.service.ts         # Cost budget enforcement
│   │   │   └── dashboard.service.ts      # Aggregated hierarchy view
│   │   │
│   │   ├── knowledge/                    # Agent Self-Learning
│   │   │   ├── knowledge.types.ts        # KnowledgeType, Scope, Entry
│   │   │   ├── knowledge.queries.ts      # Drizzle CRUD + retrieval
│   │   │   ├── knowledge.service.ts      # Retrieve, extract, vote, deduplicate
│   │   │   └── knowledge.scorer.ts       # Relevance aging, match scoring
│   │   │
│   │   ├── workflows/                    # Business Workflow Engine
│   │   │   ├── workflow.types.ts         # All workflow interfaces
│   │   │   ├── workflow.queries.ts       # Drizzle CRUD
│   │   │   ├── workflow.service.ts       # Template CRUD, versioning
│   │   │   ├── workflow-engine.service.ts # Instance execution lifecycle
│   │   │   ├── form-engine.service.ts    # Dynamic form presentation + validation
│   │   │   ├── rules-engine.service.ts   # JSON condition evaluator (NO eval!)
│   │   │   └── approval.service.ts       # Approval request, decision, auto-approve
│   │   │
│   │   ├── tenants/                      # Multi-tenant support
│   │   │   ├── tenant.types.ts
│   │   │   ├── tenant.queries.ts
│   │   │   └── tenant.service.ts         # Tenant CRUD, config management
│   │   │
│   │   ├── integrations/                 # External connectors
│   │   │   ├── integration.types.ts
│   │   │   ├── integration.queries.ts
│   │   │   ├── integration.service.ts
│   │   │   └── connectors/
│   │   │       ├── base.connector.ts     # Abstract connector interface
│   │   │       ├── telegram.connector.ts # Telegram Bot API
│   │   │       ├── webhook.connector.ts  # Generic webhook
│   │   │       └── email.connector.ts    # SMTP/API email
│   │   │
│   │   ├── conversations/                # Chat-driven workflow
│   │   │   ├── conversation.types.ts
│   │   │   ├── conversation.queries.ts
│   │   │   ├── conversation.service.ts   # Session management, state machine
│   │   │   └── chat-form.service.ts      # AI presents forms as conversation
│   │   │
│   │   └── analytics/
│   │       └── analytics.service.ts      # Metrics: completion rate, duration, cost
│   │
│   ├── mcp/
│   │   ├── server.ts                     # McpServer + register all tools/resources
│   │   ├── tools/
│   │   │   ├── task.tools.ts             # 8 tools
│   │   │   ├── agent.tools.ts            # 4 tools
│   │   │   ├── hierarchy.tools.ts        # 5 tools
│   │   │   ├── orchestration.tools.ts    # 6 tools
│   │   │   ├── message.tools.ts          # 4 tools
│   │   │   ├── monitoring.tools.ts       # 5 tools
│   │   │   ├── knowledge.tools.ts        # 6 tools: store, query, vote, get, supersede, stats
│   │   │   ├── workflow.tools.ts         # 9 tools: templates, instances, forms, approvals
│   │   │   ├── tenant.tools.ts           # 3 tools: create, get, update
│   │   │   ├── rules.tools.ts            # 3 tools: create, evaluate, list
│   │   │   ├── integration.tools.ts      # 3 tools: create, test, list
│   │   │   ├── conversation.tools.ts     # 2 tools: handle_chat, get_session
│   │   │   ├── log.tools.ts              # 2 tools
│   │   │   ├── notebook.tools.ts         # 4 tools
│   │   │   └── analytics.tools.ts        # 2 tools
│   │   └── resources/
│   │       ├── task.resources.ts          # openclaw://tasks/*
│   │       ├── hierarchy.resources.ts     # openclaw://hierarchy/*, openclaw://monitoring/*
│   │       ├── knowledge.resources.ts     # openclaw://knowledge/*
│   │       └── workflow.resources.ts      # openclaw://workflows/*, openclaw://tenants/*
│   │
│   ├── proxy/
│   │   ├── proxy.service.ts              # LLM API proxy + caching + dedup
│   │   └── cost.tracker.ts               # Per-agent/task token accounting
│   │
│   └── utils/
│       ├── id.ts                         # ULID generation
│       └── clock.ts                      # Monotonic timestamps
│
├── drizzle/                              # Generated migrations
├── data/                                 # Runtime (gitignored) — openclaw.db
└── tests/
    ├── hierarchy.test.ts                 # Closure table, authorization
    ├── orchestration.test.ts             # Decomposition, DAG, strategies
    ├── messaging.test.ts                 # Message flow, delivery
    ├── knowledge.test.ts                 # Knowledge retrieval, aging, voting
    ├── workflow.test.ts                  # Workflow execution, forms, rules
    ├── rules-engine.test.ts             # Business rules evaluation
    ├── tasks.test.ts
    └── integration.test.ts              # Full E2E flows
```

---

## 10. MCP Tools (40 tools)

### 10.1 Task Tools (8)

| Tool | Mô tả | Parameters |
|---|---|---|
| `list_tasks` | Danh sách tasks có filter | `status?`, `assigned_to?`, `priority_min?`, `tags?`, `limit?` |
| `get_task` | Chi tiết task + logs + subtasks | `task_id` |
| `create_task` | Tạo task mới | `title`, `description`, `priority?`, `urgency?`, `tags?`, `parent_task_id?`, `required_capabilities?`, `deadline?` |
| `claim_task` | Agent nhận task chưa assigned | `task_id`, `agent_id` |
| `start_task` | Chuyển assigned → in_progress | `task_id`, `agent_id` |
| `complete_task` | Hoàn thành task | `task_id`, `agent_id`, `result` |
| `fail_task` | Đánh dấu thất bại | `task_id`, `agent_id`, `error` |
| `cancel_task` | Huỷ task | `task_id`, `reason?`, `requesting_agent_id` |

### 10.2 Agent Tools (4)

| Tool | Mô tả | Parameters |
|---|---|---|
| `register_agent` | Đăng ký agent mới | `name`, `capabilities`, `role?` |
| `agent_heartbeat` | Signal alive | `agent_id` |
| `get_agent_status` | Info + current tasks | `agent_id` |
| `list_agents` | Danh sách agents | `status?`, `role?` |

### 10.3 Hierarchy Tools (5)

| Tool | Mô tả | Parameters |
|---|---|---|
| `set_agent_parent` | Gán supervisor cho agent | `agent_id`, `parent_agent_id` |
| `promote_agent` | Thăng/giáng cấp | `agent_id`, `new_role`, `requesting_agent_id` |
| `get_subordinates` | Danh sách lính dưới quyền | `agent_id`, `depth?` |
| `get_chain_of_command` | Path từ agent lên Commander | `agent_id` |
| `get_hierarchy_tree` | Full org chart | — |

### 10.4 Orchestration Tools (6)

| Tool | Mô tả | Parameters |
|---|---|---|
| `decompose_task` | Phân rã task thành subtasks | `task_id`, `agent_id`, `subtasks[]` |
| `create_execution_plan` | Tạo DAG plan cho goal | `root_task_id`, `agent_id`, `plan_graph` |
| `execute_plan` | Bắt đầu thực thi plan | `plan_id`, `agent_id` |
| `delegate_task` | Giao task cho subordinate | `task_id`, `from_agent_id`, `to_agent_id` |
| `auto_assign_task` | Decision engine chọn agent tốt nhất | `task_id`, `requesting_agent_id` |
| `get_plan_status` | Xem tiến độ execution plan | `plan_id` |

### 10.5 Messaging Tools (4)

| Tool | Mô tả | Parameters |
|---|---|---|
| `send_message` | Gửi message cho agent khác | `from_agent_id`, `to_agent_id?`, `type`, `task_id?`, `payload`, `priority?` |
| `check_messages` | Poll pending messages | `agent_id`, `type?`, `since?`, `limit?` |
| `acknowledge_message` | Đánh dấu đã xử lý | `message_id`, `agent_id` |
| `broadcast` | Gửi cho tất cả agent trong scope | `from_agent_id`, `scope`, `payload` |

### 10.6 Monitoring Tools (5)

| Tool | Mô tả | Parameters |
|---|---|---|
| `suspend_agent` | Freeze agent, reassign tasks | `agent_id`, `reason`, `requesting_agent_id` |
| `kill_agent` | Deactivate vĩnh viễn | `agent_id`, `reason`, `requesting_agent_id` |
| `set_agent_budget` | Set cost limit | `agent_id`, `budget_usd`, `requesting_agent_id` |
| `get_hierarchy_dashboard` | Full status view | — |
| `get_decision_audit` | Lịch sử decisions | `agent_id?`, `task_id?`, `decision_type?`, `limit?` |

### 10.7 Log Tools (2)

| Tool | Mô tả | Parameters |
|---|---|---|
| `write_log` | Ghi log cho task | `task_id`, `agent_id`, `level`, `message`, `metadata?` |
| `get_logs` | Đọc logs | `task_id`, `level?`, `limit?`, `since?` |

### 10.8 Notebook Tools (4)

| Tool | Mô tả | Parameters |
|---|---|---|
| `notebook_write` | Ghi/cập nhật entry | `namespace`, `key`, `value`, `content_type?`, `agent_id?` |
| `notebook_read` | Đọc entry | `namespace`, `key` |
| `notebook_list` | List entries | `namespace`, `key_prefix?` |
| `notebook_delete` | Xoá entry | `namespace`, `key` |

### 10.9 Analytics Tools (2)

| Tool | Mô tả | Parameters |
|---|---|---|
| `get_task_metrics` | Aggregate metrics | `time_range?`, `agent_id?` |
| `get_cost_report` | Token + cost breakdown | `time_range?`, `agent_id?`, `group_by?` |

### 10.10 MCP Resources (read-only)

| URI | Mô tả |
|---|---|
| `openclaw://tasks/board` | Task board overview |
| `openclaw://tasks/{task_id}` | Chi tiết task |
| `openclaw://agents/status` | All agents + states |
| `openclaw://hierarchy/tree` | Visual org chart |
| `openclaw://hierarchy/{agent_id}/subordinates` | Agent's team view |
| `openclaw://plans/{plan_id}` | Execution plan DAG + status |
| `openclaw://monitoring/dashboard` | Global health dashboard |

---

## 11. Proxy API Layer

### Chức năng:
1. **Token accounting** — Mọi LLM call qua proxy → ghi `token_usage` → per-agent, per-task cost
2. **Request dedup** — Requests giống nhau trong cửa sổ ngắn → cached response
3. **Budget enforcement** — Per-task + per-agent budget, proxy reject khi vượt
4. **Model routing** — Auto-route task đơn giản sang model rẻ hơn
5. **Cache hit tracking** — Detect prompt caching efficiency per agent

### Flow:
```
Agent → http://localhost:{PROXY_PORT}/v1/messages
  → Proxy check budget (reject nếu over)
  → Proxy check dedup cache (return cached nếu match)
  → Proxy forward to real LLM API
  → Proxy ghi token_usage record
  → Proxy return response to agent
```

---

## 12. Authorization Enforcement

Middleware function gọi ở đầu mỗi MCP tool handler:

```typescript
function assertAuthorized(
  actingAgent: Agent,
  action: Action,
  targetAgent?: Agent,
  targetTask?: Task
): void {
  // 1. Check role-based permission (từ permission matrix)
  // 2. Check hierarchy relationship (target có trong subtree?)
  // 3. Check task ownership (acting agent là delegator/assignee?)
  // Throws AuthorizationError nếu fail
}
```

---

## 13. Startup Sequence

```
1. Load + validate config (.env → Zod)
2. Open SQLite connection (WAL mode)
3. Run pending Drizzle migrations
4. Initialize ALL service modules
5. Create McpServer, register 40 tools + 7 resources
6. Start stdio transport (luôn bật)
7. Start Streamable HTTP transport (optional, cho dashboard)
8. Start Orchestrator tick loop (5s interval)
9. Start Proxy server (optional, separate port)
```

---

## 14. Design Decisions & Trade-offs

| Decision | Lý do |
|----------|-------|
| **Single Commander** | Tránh split-brain. Commander offline → degraded mode (plans tiếp tục, không decompose mới) cho đến khi human intervene |
| **Closure table** thay recursive CTE | O(1) subtree lookup, critical khi orchestrator tick mỗi 5s |
| **Pull-based messaging** | MCP stdio không hỗ trợ push. HTTP transport có thể thêm SSE notification sau |
| **Decision audit trail** | Non-negotiable. LLM ra quyết định delegation/retry → phải review được tại sao |
| **Budget at agent level** | Chống runaway agent tiêu resource across many tasks. Check cả proxy (per-request) lẫn orchestrator (aggregate) |
| **ULID over UUID** | Lexicographically sortable by time → PK index tự nhiên order by creation |
| **JSON columns** cho flexible data | Tránh migration mỗi khi thêm tag/capability mới |
| **Service ↔ MCP tool separation** | Tools là thin wrappers (validate Zod → call service). Service testable independently |

---

## 15. Dependencies

### Runtime
```
@modelcontextprotocol/sdk    # MCP server + transport
zod                          # Schema validation
better-sqlite3               # SQLite driver
drizzle-orm                  # Type-safe query builder
ulid                         # ID generation
```

### Dev
```
drizzle-kit                  # Migration generation
typescript                   # Compiler
@types/better-sqlite3        # Type definitions
vitest                       # Testing
tsx                          # Dev runner
```

---

## 16. Thứ tự triển khai

### Phase A — Foundation + Schema
1. `package.json`, `tsconfig.json`, `drizzle.config.ts`
2. `src/config.ts` — Zod env config
3. `src/db/schema.ts` — ALL 10 tables
4. `src/db/connection.ts` + `src/db/migrate.ts`
5. `src/utils/id.ts` + `src/utils/clock.ts`
6. Generate initial migration

### Phase B — Hierarchy Module
7. `hierarchy.types.ts` — Role, AuthorityLevel, HierarchyNode
8. `hierarchy.queries.ts` — Closure table CRUD
9. `hierarchy.service.ts` — setParent, promote, getSubtree, getChainOfCommand
10. `authorization.ts` — Permission matrix enforcement

### Phase C — Core Services
11. `agent.service.ts` — Registration, heartbeat, roles, performance
12. `task.service.ts` — CRUD + lifecycle with delegation/dependency
13. `log.service.ts` — Log append/query
14. `notebook.service.ts` — Namespaced KV with access control

### Phase D — Messaging
15. `message.types.ts` — MessageType, payload unions
16. `message.queries.ts`
17. `message.service.ts` — send, poll, acknowledge, broadcast

### Phase E — Decisions + Orchestration (The Brain)
18. `decision.service.ts` — Record + query decisions
19. `orchestration.types.ts` — ExecutionPlan, DAGNode, Strategy
20. `decision-engine.ts` — Agent scoring, task matching
21. `decomposer.ts` — LLM-powered task decomposition
22. `dag-executor.ts` — DAG walking, dependency tracking
23. `strategies/*.ts` — 4 strategy implementations
24. `orchestrator.service.ts` — Main tick loop

### Phase F — Monitoring
25. `monitor.service.ts` — Heartbeat check, stale detection
26. `budget.service.ts` — Cost enforcement
27. `dashboard.service.ts` — Aggregated views

### Phase G — MCP Layer
28. `src/mcp/server.ts` — McpServer setup
29. ALL tool files (8 files, 40 tools)
30. ALL resource files (2 files, 7 resources)

### Phase H — Entry Point + Proxy
31. `src/index.ts` — Wire everything, start orchestrator + transports
32. `proxy.service.ts` + `cost.tracker.ts`

### Phase I — Analytics + Tests
33. `analytics.service.ts`
34. ALL test files (5 files)

---
---

# PHẦN 2: AGENT SELF-LEARNING SYSTEM

---

## 17. Hệ thống tự học (Knowledge/Experience Memory)

### 17.1 Concept

Agent học từ kinh nghiệm và cải thiện theo thời gian:
- Sau mỗi task (success/failure) → lưu "lessons learned" vào knowledge base
- Trước khi bắt đầu task mới → query knowledge base tìm kinh nghiệm liên quan
- Tránh lặp lỗi cũ, tái sử dụng pattern thành công
- Knowledge có thể chia sẻ (global) hoặc riêng tư (per-agent)

### 17.2 Data Models

#### knowledge_entries

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| type | TEXT | `lesson_learned` / `best_practice` / `anti_pattern` / `domain_knowledge` / `procedure` |
| title | TEXT | Short summary |
| content | TEXT | Full description |
| domain | TEXT | Domain: `database`, `frontend`, `sales`, `order-processing`... |
| tags | TEXT (JSON) | `["retry", "timeout", "api-call", ...]` |
| source_task_id | TEXT | FK → tasks, nullable |
| source_agent_id | TEXT | FK → agents |
| scope | TEXT | `global` / `agent:{agent_id}` / `team:{supervisor_id}` / `domain:{domain}` |
| relevance_score | REAL | 0.0 → 1.0, bắt đầu 0.5 |
| confidence | REAL | 0.0 → 1.0 |
| usage_count | INTEGER | Số lần được retrieve + apply |
| upvotes | INTEGER | Default 0 |
| downvotes | INTEGER | Default 0 |
| outcome | TEXT | `success` / `failure` / `neutral` |
| context_snapshot | TEXT (JSON) | Task type, capabilities, error messages... |
| superseded_by_id | TEXT | FK → knowledge_entries, nullable |
| expires_at | INTEGER | nullable |
| created_at | INTEGER | |
| updated_at | INTEGER | |

#### knowledge_votes

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| knowledge_id | TEXT | FK → knowledge_entries |
| agent_id | TEXT | FK → agents |
| vote | INTEGER | +1 hoặc -1 |
| comment | TEXT | nullable, lý do vote |
| created_at | INTEGER | |

> Unique: `(knowledge_id, agent_id)` — mỗi agent chỉ vote 1 lần per entry.

#### knowledge_applications (tracking khi knowledge được sử dụng)

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| knowledge_id | TEXT | FK → knowledge_entries |
| task_id | TEXT | FK → tasks |
| agent_id | TEXT | FK → agents |
| was_helpful | INTEGER | nullable, 1 = yes, 0 = no (set sau khi task xong) |
| created_at | INTEGER | |

### 17.3 Knowledge Aging Formula

Relevance phân rã theo thời gian, boost bởi usage và votes:

```
effective_relevance = base_relevance × time_decay × vote_factor × usage_factor

time_decay = max(0.1, 1.0 - (days_since_creation / 365) × 0.3)
  → Mất 30% relevance/năm, floor tại 0.1

vote_factor = 1.0 + (upvotes - downvotes) × 0.05
  → Mỗi net upvote +5%, cap tại 2.0

usage_factor = 1.0 + log2(1 + usage_count) × 0.1
  → Knowledge dùng nhiều → logarithmic boost
```

Computed tại query time, không lưu — luôn fresh.

### 17.4 Knowledge Retrieval (khi agent bắt đầu task)

```
FUNCTION retrieve_relevant_knowledge(task, agent):
  candidates = SELECT FROM knowledge_entries WHERE:
    scope IN ('global', 'agent:{agent.id}', 'team:{agent.parent_id}', 'domain:{task.domain}')
    AND superseded_by_id IS NULL
    AND (expires_at IS NULL OR expires_at > now)

  FOR each candidate:
    tag_overlap       = jaccard(task.tags, candidate.tags)
    capability_overlap = jaccard(task.required_capabilities, candidate related tags)
    domain_match      = 1.0 if task.domain == candidate.domain else 0.2
    eff_relevance     = compute_effective_relevance(candidate)

    match_score = tag_overlap       × 0.35
                + capability_overlap × 0.25
                + domain_match      × 0.25
                + eff_relevance     × 0.15

  RETURN top-K candidates by match_score (default K=5)
```

### 17.5 Learning Pipeline (sau khi task xong)

```
FUNCTION extract_knowledge(task, agent, outcome):
  1. GATHER context:
     - task description, tags, required_capabilities
     - task_logs cho task này
     - error message (nếu failed)
     - duration vs estimate
     - retry count

  2. GENERATE knowledge (agent/Commander qua LLM):
     IF outcome == 'completed':
       type = 'best_practice' hoặc 'procedure'
       content = summary cái gì đã work
     IF outcome == 'failed':
       type = 'anti_pattern' hoặc 'lesson_learned'
       content = cái gì sai + cách tránh
     IF retry_count > 0 AND eventually completed:
       type = 'lesson_learned'
       content = retry đã fix cái gì

  3. DEDUP check:
     Query existing knowledge: same domain + high tag overlap
     If >0.8 similarity → update existing thay vì tạo mới
     If contradicts existing → mark old as superseded

  4. STORE knowledge_entry:
     source_task_id, source_agent_id
     confidence = agent.performance_score (agent giỏi → knowledge đáng tin hơn)
     scope = default 'global' cho lessons, 'agent:{id}' cho procedures
```

### 17.6 Tích hợp vào hệ thống hiện tại

**Orchestrator tick loop** — thêm step 7:
```
7. KNOWLEDGE EXTRACTION
   Query tasks: status = completed/failed trong last tick
   WHERE chưa có knowledge_entry với source_task_id = task.id
   → Run extract_knowledge pipeline
   → Store entries
```

**Agent selection (decision-engine)** — bổ sung scoring:
```
knowledge_factor = count anti_patterns cho task type này
                   mà agent này CHƯA fail trước đó
→ Agent đã học từ failures score cao hơn
```

**Task start flow** — auto-inject:
Khi agent gọi `start_task` → system tự retrieve relevant knowledge
→ Ghi vào notebook `task:{task_id}:knowledge`
→ Agent đọc trước khi làm việc

### 17.7 MCP Tools — Knowledge (6 tools)

| Tool | Mô tả | Parameters |
|---|---|---|
| `store_knowledge` | Lưu knowledge entry | `type`, `title`, `content`, `domain`, `tags`, `scope?`, `source_task_id?`, `agent_id` |
| `query_knowledge` | Tìm knowledge liên quan | `domain?`, `tags?`, `capabilities?`, `scope?`, `limit?`, `agent_id` |
| `vote_knowledge` | Upvote/downvote | `knowledge_id`, `agent_id`, `vote` (+1/-1), `comment?` |
| `get_knowledge` | Chi tiết 1 entry | `knowledge_id` |
| `supersede_knowledge` | Đánh dấu entry bị thay thế | `old_knowledge_id`, `new_knowledge_id`, `agent_id` |
| `get_knowledge_stats` | Thống kê knowledge base | `domain?`, `agent_id?`, `time_range?` |

---
---

# PHẦN 3: BUSINESS WORKFLOW ENGINE

---

## 18. Workflow Engine (Extensible Business Automation)

### 18.1 Concept

Hệ thống workflow mở rộng — không hardcode cho bất kỳ domain nào. Ví dụ use case:

**Sales Order (Telegram Bot):**
```
Sale chat bot → Bot hiển thị tutorial (nếu mới)
  → Sale tạo đơn hàng qua chat
  → AI hiển thị form từng field một
  → AI validate theo business rules
  → Auto-approve nếu đạt chuẩn / escalate lên manager nếu không
  → Forward đến nhà cung cấp qua webhook
  → Notify sale kết quả
```

**Nhưng có thể mở rộng cho:**
- HR: Leave request, onboarding
- Procurement: Purchase order approval
- Support: Ticket routing + escalation
- Bất kỳ quy trình nào có stages + forms + rules + approvals

### 18.2 Data Models

#### tenants (Multi-tenant)

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| name | TEXT | Tên doanh nghiệp |
| config | TEXT (JSON) | Language, timezone, currency... |
| ai_config | TEXT (JSON) | AI behavior: tone, language, model preferences |
| status | TEXT | `active` / `suspended` / `archived` |
| created_at | INTEGER | |
| updated_at | INTEGER | |

#### workflow_templates

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| tenant_id | TEXT | FK → tenants |
| name | TEXT | "Sales Order", "Leave Request"... |
| description | TEXT | |
| domain | TEXT | `sales`, `hr`, `procurement`... |
| version | INTEGER | Versioning templates |
| stages | TEXT (JSON) | Ordered array of stage definitions |
| trigger_config | TEXT (JSON) | Chat command, webhook, schedule |
| config | TEXT (JSON) | Template-level settings |
| status | TEXT | `draft` / `active` / `archived` |
| created_at | INTEGER | |
| updated_at | INTEGER | |

> Unique: `(tenant_id, name, version)`

**Stage definition structure:**

```typescript
interface WorkflowStage {
  id: string;                // "collect_info"
  name: string;              // "Thu thập thông tin đơn hàng"
  type: 'form' | 'validation' | 'approval' | 'action' | 'notification' | 'conditional';

  // Cho type='form'
  form_id?: string;          // FK → form_templates

  // Cho type='validation'
  rules_id?: string;         // FK → business_rules

  // Cho type='approval'
  approval_config?: {
    approver_role: string;              // "manager"
    auto_approve_rules_id?: string;     // Rules cho auto-approve
    escalation_timeout_ms?: number;
  };

  // Cho type='action'
  action_config?: {
    integration_id: string;  // FK → integrations
    action_type: string;     // "send_webhook", "send_email", "create_record"
    payload_template: object; // Template với {{variables}}
  };

  // Cho type='notification'
  notification_config?: {
    channel: string;         // "telegram", "email", "sms"
    template: string;        // "Đơn hàng {{order_id}} đã được duyệt"
    recipients: string[];    // Role-based hoặc explicit
  };

  // Cho type='conditional'
  conditional_config?: {
    rules_id: string;        // FK → business_rules
    true_next: string;       // stage_id nếu true
    false_next: string;      // stage_id nếu false
  };

  next_stage_id?: string;    // Linear flow default
  timeout_ms?: number;
  retry_config?: { max_retries: number; backoff_ms: number; };
}
```

#### form_templates

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| tenant_id | TEXT | FK → tenants |
| name | TEXT | "Sales Order Form" |
| schema | TEXT (JSON) | JSON Schema defining fields |
| ui_hints | TEXT (JSON) | AI presentation hints |
| version | INTEGER | |
| status | TEXT | `active` / `archived` |
| created_at | INTEGER | |
| updated_at | INTEGER | |

**Form field structure:**

```typescript
interface FormField {
  id: string;              // "customer_name"
  label: string;           // "Tên khách hàng"
  type: 'text' | 'number' | 'date' | 'select' | 'multi_select' |
        'phone' | 'email' | 'address' | 'file' | 'boolean';
  required: boolean;
  options?: string[];      // Cho select/multi_select
  validation?: {
    min?: number; max?: number;
    min_length?: number; max_length?: number;
    pattern?: string;      // Regex
    custom_rule_id?: string;
  };
  default_value?: any;
  ai_prompt_hint?: string; // "Hỏi tên đầy đủ theo pháp lý của khách hàng"
  depends_on?: {           // Conditional visibility
    field_id: string;
    condition: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
    value: any;
  };
  group?: string;          // Logical grouping cho multi-step
}
```

#### business_rules

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| tenant_id | TEXT | FK → tenants |
| name | TEXT | "Đơn hàng > 10tr cần Manager duyệt" |
| description | TEXT | |
| domain | TEXT | `sales`, `procurement`... |
| rule_type | TEXT | `validation` / `approval` / `routing` / `calculation` / `auto_action` |
| conditions | TEXT (JSON) | Rule condition tree |
| actions | TEXT (JSON) | Actions khi conditions match |
| priority | INTEGER | Higher = evaluate first |
| status | TEXT | `active` / `disabled` |
| created_at | INTEGER | |
| updated_at | INTEGER | |

**Rule condition structure (declarative, NO eval!):**

```typescript
interface RuleCondition {
  type: 'AND' | 'OR' | 'NOT' | 'comparison';
  children?: RuleCondition[];        // Cho AND/OR/NOT
  field?: string;                    // Dot-path: "form_data.order_total"
  operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' |
             'in' | 'not_in' | 'contains' | 'matches';
  value?: any;                       // Static hoặc "${field_ref}" cho dynamic
}

interface RuleAction {
  type: 'approve' | 'reject' | 'escalate' | 'set_field' | 'notify' | 'route_to_stage';
  params: Record<string, any>;
}
```

**Ví dụ rule:**
```json
{
  "name": "Đơn hàng > 10tr cần Manager duyệt",
  "conditions": {
    "type": "AND",
    "children": [
      { "type": "comparison", "field": "form_data.order_total", "operator": "gt", "value": 10000000 },
      { "type": "comparison", "field": "form_data.payment_method", "operator": "eq", "value": "credit" }
    ]
  },
  "actions": [{ "type": "escalate", "params": { "to_role": "manager" } }]
}
```

#### workflow_instances (running executions)

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| template_id | TEXT | FK → workflow_templates |
| tenant_id | TEXT | FK → tenants |
| initiated_by | TEXT | User/agent identifier |
| current_stage_id | TEXT | Stage đang active |
| status | TEXT | `active` / `paused` / `completed` / `failed` / `cancelled` |
| form_data | TEXT (JSON) | Accumulated form data qua các stages |
| context_data | TEXT (JSON) | Workflow variables, computed values, integration responses |
| task_id | TEXT | FK → tasks, nullable (link vào OpenClaw task) |
| conversation_id | TEXT | nullable, link vào chat session |
| channel | TEXT | `telegram` / `web` / `api` / `slack` |
| history | TEXT (JSON) | Array stage transitions + timestamps |
| error | TEXT | nullable |
| created_at | INTEGER | |
| updated_at | INTEGER | |
| completed_at | INTEGER | nullable |

#### workflow_approvals

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| instance_id | TEXT | FK → workflow_instances |
| stage_id | TEXT | Stage nào yêu cầu approval |
| approver_id | TEXT | Ai cần duyệt |
| status | TEXT | `pending` / `approved` / `rejected` / `escalated` / `auto_approved` |
| decision_reason | TEXT | nullable |
| auto_approved_by_rule_id | TEXT | FK → business_rules, nullable |
| created_at | INTEGER | |
| decided_at | INTEGER | nullable |

#### integrations

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| tenant_id | TEXT | FK → tenants |
| name | TEXT | "Supplier Webhook", "Telegram Bot" |
| type | TEXT | `telegram` / `webhook` / `email` / `slack` / `whatsapp` / `sms` / `custom` |
| config | TEXT (JSON) | Type-specific: API keys, URLs, tokens |
| status | TEXT | `active` / `disabled` / `error` |
| last_used_at | INTEGER | nullable |
| created_at | INTEGER | |
| updated_at | INTEGER | |

#### conversation_sessions

| Column | Type | Notes |
|---|---|---|
| id | TEXT (ULID) | Primary key |
| tenant_id | TEXT | FK → tenants |
| channel | TEXT | `telegram` / `web` / `slack` |
| channel_user_id | TEXT | Platform-specific user ID |
| user_name | TEXT | nullable |
| user_role | TEXT | nullable: `salesperson`, `manager`... |
| active_instance_id | TEXT | FK → workflow_instances, nullable |
| state | TEXT (JSON) | Conversation state machine data |
| last_message_at | INTEGER | |
| created_at | INTEGER | |

### 18.3 Workflow Execution Flow

```
FUNCTION start_workflow(template_id, tenant_id, initiated_by, channel):
  1. Load workflow_template
  2. Create workflow_instance: status='active', current_stage = first stage
  3. Create linked OpenClaw task (Commander nhận như top-level task)
     → Mỗi stage = 1 subtask trong DAG
  4. Execute first stage

FUNCTION execute_stage(instance, stage):
  SWITCH stage.type:

    CASE 'form':
      Load form_template
      IF channel là chat (telegram/slack):
        → chat-form.service: hỏi từng field qua conversation
        → Validate inline, store vào instance.form_data
        → Khi đủ fields → advance to next stage
      IF channel là API:
        → Return form schema, chờ submission

    CASE 'validation':
      Load business_rules
      Evaluate conditions against form_data + context_data
      IF all pass → advance
      IF fail → return errors, quay lại form stage sửa

    CASE 'approval':
      Check auto_approve_rules trước
      IF auto-approve conditions met:
        → Create approval: status='auto_approved'
        → Advance
      ELSE:
        → Create approval: status='pending'
        → Notify approver qua channel
        → Pause instance, chờ decision
        → Approved → advance
        → Rejected → notify initiator, route back

    CASE 'conditional':
      Evaluate rules
      IF true → go to true_next stage
      IF false → go to false_next stage

    CASE 'action':
      Load integration
      Render payload_template với instance data
      Call connector (webhook/email/...)
      Store response in context_data
      Advance

    CASE 'notification':
      Render message template
      Send via channel
      Advance (non-blocking)

  IF no next stage → complete_workflow(instance)
```

### 18.4 Conversational Form Collection (AI interface)

AI biến form database thành conversation tự nhiên:

```
FUNCTION collect_form_conversationally(session, form_template, instance):
  collected = instance.form_data or {}
  remaining = form_template.fields
    .filter(f => !collected[f.id])
    .filter(f => evaluate_depends_on(f, collected))

  FOR each field in remaining:
    // AI generate prompt từ field.ai_prompt_hint + field.label
    // VD: "Tên khách hàng của đơn hàng này là gì?"
    prompt = generate_field_prompt(field, session.user_role, tenant.ai_config)
    send_message(session.channel, prompt)

    response = await_user_response(session)

    validation = validate_field(field, response)
    IF validation.error:
      send_message(session.channel, friendly_error(validation.error))
      CONTINUE  // hỏi lại field này

    collected[field.id] = validation.parsed_value
    update_instance(instance, collected)

  // Tất cả fields đã thu thập
  send_message(session.channel, format_summary(collected, form_template))
  send_message(session.channel, "Thông tin đã đúng chưa? (đúng/sửa)")
```

### 18.5 Rules Engine (Declarative, Secure)

```
FUNCTION evaluate_rule(rule, data):
  result = evaluate_condition(rule.conditions, data)
  IF result → RETURN execute_actions(rule.actions, data)
  RETURN null

FUNCTION evaluate_condition(condition, data):
  SWITCH condition.type:
    'AND': RETURN children.every(c => evaluate_condition(c, data))
    'OR':  RETURN children.some(c => evaluate_condition(c, data))
    'NOT': RETURN !evaluate_condition(children[0], data)
    'comparison':
      field_value = get_nested(data, condition.field)  // dot-path
      compare_value = resolve_value(condition.value, data)
      RETURN compare(field_value, condition.operator, compare_value)
```

> **SECURITY**: Rules engine chỉ evaluate declarative JSON conditions — KHÔNG có eval() hay arbitrary code. Critical cho multi-tenant system.

### 18.6 Tích hợp với Agent Hierarchy

Commander điều phối business workflows như first-class tasks:

```
Khi workflow start:
  Commander tạo top-level task:
    title: "Execute workflow: {template.name}"
    tags: ["workflow", template.domain]
    required_capabilities: ["workflow-engine"]

  Workflow engine specialist agent được assign.

  Mỗi stage trở thành subtask:
    "collect_info" → subtask: required_capabilities: ["form-collection"]
    "validate"     → subtask: required_capabilities: ["rules-evaluation"]
    "approve"      → subtask (blocks until approval)
    "action"       → subtask: required_capabilities: ["integration-{type}"]

  DAG mirrors workflow stage graph.
  → Được hưởng toàn bộ: audit trail, monitoring, budget, retry, escalation
```

### 18.7 MCP Tools — Business Workflow

**Tenant Tools (3)**

| Tool | Mô tả | Parameters |
|---|---|---|
| `create_tenant` | Tạo tenant mới | `name`, `config?`, `ai_config?` |
| `get_tenant` | Chi tiết tenant | `tenant_id` |
| `update_tenant` | Update config | `tenant_id`, `config?`, `ai_config?`, `status?` |

**Workflow Template Tools (4)**

| Tool | Mô tả | Parameters |
|---|---|---|
| `create_workflow_template` | Định nghĩa workflow | `tenant_id`, `name`, `domain`, `stages`, `trigger_config?` |
| `get_workflow_template` | Chi tiết template | `template_id` |
| `list_workflow_templates` | Danh sách templates | `tenant_id`, `domain?`, `status?` |
| `update_workflow_template` | Update (tạo version mới) | `template_id`, fields to update |

**Form Tools (3)**

| Tool | Mô tả | Parameters |
|---|---|---|
| `create_form_template` | Định nghĩa form | `tenant_id`, `name`, `schema`, `ui_hints?` |
| `get_form_template` | Chi tiết form | `form_id` |
| `list_form_templates` | Danh sách forms | `tenant_id` |

**Rules Tools (3)**

| Tool | Mô tả | Parameters |
|---|---|---|
| `create_business_rule` | Định nghĩa rule | `tenant_id`, `name`, `domain`, `rule_type`, `conditions`, `actions` |
| `evaluate_rules` | Test rules với data | `rule_ids[]`, `data` |
| `list_business_rules` | Danh sách rules | `tenant_id`, `domain?`, `rule_type?` |

**Workflow Execution Tools (5)**

| Tool | Mô tả | Parameters |
|---|---|---|
| `start_workflow` | Khởi chạy workflow | `template_id`, `tenant_id`, `initiated_by`, `channel`, `initial_data?` |
| `get_workflow_instance` | Status + data | `instance_id` |
| `submit_form_data` | Submit data cho stage hiện tại | `instance_id`, `form_data` |
| `decide_approval` | Approve/reject | `approval_id`, `decision`, `reason?`, `approver_id` |
| `list_workflow_instances` | Danh sách instances | `tenant_id?`, `status?`, `template_id?` |

**Integration Tools (3)**

| Tool | Mô tả | Parameters |
|---|---|---|
| `create_integration` | Đăng ký integration | `tenant_id`, `name`, `type`, `config` |
| `test_integration` | Test gửi payload | `integration_id`, `test_payload` |
| `list_integrations` | Danh sách integrations | `tenant_id`, `type?` |

**Conversation Tools (2)**

| Tool | Mô tả | Parameters |
|---|---|---|
| `handle_chat_message` | Xử lý tin nhắn trong workflow context | `session_id`, `message`, `channel` |
| `get_conversation_session` | Lấy session state | `session_id` |

### 18.8 MCP Resources — Business

| URI | Mô tả |
|---|---|
| `openclaw://knowledge/dashboard` | Knowledge base overview |
| `openclaw://workflows/templates` | All templates by tenant |
| `openclaw://workflows/{instance_id}` | Instance detail + current stage |
| `openclaw://tenants/{tenant_id}/dashboard` | Tenant overview |

---

## 19. Cross-System Integration

Hai hệ thống bổ trợ lẫn nhau:

### Knowledge ↔ Workflow
- **Knowledge → Workflow**: Khi workflow stage fail nhiều lần (vd: supplier webhook timeout), knowledge system capture `anti_pattern`. Workflow sau tự thêm retry backoff.
- **Workflow → Knowledge**: Mỗi workflow instance hoàn thành = learning opportunity. Nếu 80% đơn hàng từ region X bị reject → `domain_knowledge` → AI proactively hướng dẫn sale.

### Commander orchestrates cả hai
- Commander không cần capabilities mới — đã biết orchestrate task DAGs
- Workflow stages map thành subtasks
- Knowledge retrieval inject vào task-start flow
- Decomposition algorithm tham khảo knowledge base

---

## 20. Tổng kết: Tất cả Tables (21 bảng)

| # | Table | Module | Mô tả |
|---|---|---|---|
| 1 | agents | agents | Agent registry + hierarchy info |
| 2 | agent_hierarchy | hierarchy | Closure table cho subtree queries |
| 3 | tasks | tasks | Task lifecycle + DAG |
| 4 | task_dependencies | tasks | DAG edges |
| 5 | task_logs | logs | Structured logs |
| 6 | messages | messaging | Inter-agent communication |
| 7 | decisions | decisions | Audit trail |
| 8 | execution_plans | orchestration | DAG plans |
| 9 | notebooks | notebooks | Namespaced KV store |
| 10 | token_usage | proxy | Token accounting |
| 11 | knowledge_entries | knowledge | Agent experience memory |
| 12 | knowledge_votes | knowledge | Vote system |
| 13 | knowledge_applications | knowledge | Usage tracking |
| 14 | tenants | tenants | Multi-tenant |
| 15 | workflow_templates | workflows | Workflow definitions |
| 16 | form_templates | workflows | Dynamic forms |
| 17 | business_rules | workflows | Declarative rules |
| 18 | workflow_instances | workflows | Running workflows |
| 19 | workflow_approvals | workflows | Approval tracking |
| 20 | integrations | integrations | External connectors |
| 21 | conversation_sessions | conversations | Chat sessions |

---

## 21. Tổng kết: Tất cả MCP Tools (63 tools)

| Module | Count | Tools |
|---|---|---|
| Task | 8 | list, get, create, claim, start, complete, fail, cancel |
| Agent | 4 | register, heartbeat, status, list |
| Hierarchy | 5 | set_parent, promote, subordinates, chain, tree |
| Orchestration | 6 | decompose, plan, execute, delegate, auto_assign, plan_status |
| Messaging | 4 | send, check, acknowledge, broadcast |
| Monitoring | 5 | suspend, kill, set_budget, dashboard, audit |
| Knowledge | 6 | store, query, vote, get, supersede, stats |
| Workflow Template | 4 | create, get, list, update |
| Form | 3 | create, get, list |
| Rules | 3 | create, evaluate, list |
| Workflow Execution | 5 | start, get_instance, submit_form, decide_approval, list_instances |
| Integration | 3 | create, test, list |
| Conversation | 2 | handle_chat, get_session |
| Log | 2 | write, get |
| Notebook | 4 | write, read, list, delete |
| Analytics | 2 | metrics, cost_report |
| **TOTAL** | **63** | |

---

## 22. Tổng kết: Tất cả MCP Resources (11 resources)

| URI | Mô tả |
|---|---|
| `openclaw://tasks/board` | Task board overview |
| `openclaw://tasks/{task_id}` | Chi tiết task |
| `openclaw://agents/status` | All agents + states |
| `openclaw://hierarchy/tree` | Org chart |
| `openclaw://hierarchy/{agent_id}/subordinates` | Team view |
| `openclaw://plans/{plan_id}` | Execution plan |
| `openclaw://monitoring/dashboard` | Health dashboard |
| `openclaw://knowledge/dashboard` | Knowledge base stats |
| `openclaw://workflows/templates` | All workflow templates |
| `openclaw://workflows/{instance_id}` | Workflow instance detail |
| `openclaw://tenants/{tenant_id}/dashboard` | Tenant overview |

---

## 23. Thứ tự triển khai (Updated — tất cả phases)

### Phase A — Foundation + Schema
1. `package.json`, `tsconfig.json`, `drizzle.config.ts`
2. `src/config.ts`
3. `src/db/schema.ts` — ALL 21 tables
4. `src/db/connection.ts` + `src/db/migrate.ts`
5. `src/utils/id.ts` + `src/utils/clock.ts`
6. Generate initial migration

### Phase B — Hierarchy Module
7-10. hierarchy types, queries, service, authorization

### Phase C — Core Services
11-14. agent, task, log, notebook services

### Phase D — Messaging
15-17. message types, queries, service

### Phase E — Decisions + Orchestration
18-24. decision service, orchestration engine, DAG executor, strategies

### Phase F — Monitoring
25-27. monitor, budget, dashboard services

### Phase G — MCP Layer (Core)
28-30. server.ts, core tool files, resource files

### Phase H — Entry Point + Proxy
31-32. index.ts, proxy service

### Phase I — Analytics + Tests (Core)
33-34. analytics service, core test files

### Phase J — Knowledge System
35. Add knowledge tables to schema
36-39. knowledge types, queries, scorer, service
40. knowledge.tools.ts (6 tools)
41. Integrate into orchestrator + task-start flow
42. knowledge.test.ts

### Phase K — Tenant & Config
43-45. tenant types, queries, service + tools

### Phase L — Business Rules Engine
46-48. rules-engine service + tools + tests

### Phase M — Form Engine
49-50. form-engine service + tools

### Phase N — Workflow Engine
51-56. workflow types, queries, service, engine, approval service, tools

### Phase O — Integrations & Connectors
57-62. base connector, telegram, webhook, email, integration service, tools

### Phase P — Conversational Interface
63-66. conversation service, chat-form service, tools

### Phase Q — Integration Testing
67-70. knowledge, workflow, rules, E2E test files
