/**
 * Prompt Builder — builds the Commander system prompt from DB config.
 */

export function buildCommanderPrompt(
  tenantName: string, userName: string, userRole: string,
  aiConfig: Record<string, unknown>
): string {
  const cfg = aiConfig as any;
  const botName = cfg.bot_name ?? "Bot";
  const botIntro = cfg.bot_intro ?? "trợ lý AI";
  const rolePerms = cfg.role_permissions ?? {};
  const userPermissions = rolePerms[userRole] ?? `${userRole.toUpperCase()}`;
  const defaultRules = [
    "TUYỆT ĐỐI KHÔNG tự bịa/hallucinate data. Chỉ trả lời dựa trên data thật từ tools hoặc knowledge base",
    "Khi user hỏi về file/cẩm nang/tài liệu → PHẢI gọi list_files rồi read_file_content trước khi trả lời",
    "Khi user muốn lưu/tạo đơn hàng/dữ liệu → PHẢI dùng create_collection (tạo bảng) + add_row (thêm dòng) để LƯU VÀO DB THẬT",
    "Khi user hỏi xem đơn hàng/dữ liệu → PHẢI gọi list_rows để query DB, KHÔNG tự bịa mã đơn hay số liệu",
    "KHÔNG tự tạo URL. Khi cần gửi file/ảnh → gọi tool send_file(file_id)",
    "Khi user tìm kiếm data mà KHÔNG nói rõ khoảng thời gian/bộ lọc → HỎI LẠI: 'Bạn muốn xem tất cả hay lọc theo thời gian/trạng thái?' trước khi gọi search_all",
    "list_rows/search_all có hỗ trợ keyword filter — dùng search_all(keyword='từ khoá') để lọc, KHÔNG load hết rồi lọc bằng text",
    "Khi kết quả > 20 rows → trả summary (tổng, phân loại) + hỏi user muốn xem chi tiết phần nào",
    "Ngắn gọn, thực tế, đúng trọng tâm câu hỏi",
    "Khi thực thi task nhiều bước (deploy, cài đặt, setup...): chạy hết TẤT CẢ bước cho đến khi HOÀN THÀNH mục tiêu user đề ra. Nếu 1 bước fail → tự tìm cách fix → retry → tiếp bước sau. KHÔNG dừng để hỏi user giữa chừng trừ khi cần thông tin chỉ user mới có. Chỉ trả lời khi đã hoàn thành hoặc đã thử 3 lần không fix được",
  ];
  const rules = [...defaultRules, ...((cfg.rules as string[]) ?? [])];
  const customInstructions = (cfg.custom_instructions as string) ?? "";

  // Build tool instructions from DB config
  const tools = cfg.tools ?? {};
  let toolInstructions = "Bạn có tools sau. Khi cần, output JSON block ```tool_calls để gọi:\n";

  let idx = 1;
  for (const [category, toolList] of Object.entries(tools)) {
    const label = category === "business" ? "Business" : category === "agent_management" ? "Agent Management (ADMIN only)" : category;
    toolInstructions += `\nTools — ${label}:\n`;
    for (const t of toolList as any[]) {
      toolInstructions += `${idx}. ${t.name}(${t.args ?? ""}) — ${t.desc}\n`;
      idx++;
    }
  }

  toolInstructions += `\nCách gọi tool:\n\`\`\`tool_calls\n[{"tool":"tên_tool","args":{"key":"value"}}]\n\`\`\``;

  // Build rules
  const rulesText = rules.map((r: string) => `• ${r}`).join("\n");

  // Use template from DB, or fallback
  const template = (cfg.prompt_template as string) ?? `Bạn là {{bot_name}} — {{bot_intro}} của {{tenant_name}}.

USER: {{user_name}} | ROLE: {{user_role}}
QUYỀN: {{user_permissions}}

{{tool_instructions}}

QUY TẮC:
{{rules}}

{{custom_instructions}}`;

  return template
    .replace(/\{\{bot_name\}\}/g, botName)
    .replace(/\{\{bot_intro\}\}/g, botIntro)
    .replace(/\{\{tenant_name\}\}/g, tenantName)
    .replace(/\{\{user_name\}\}/g, userName)
    .replace(/\{\{user_role\}\}/g, userRole)
    .replace(/\{\{user_permissions\}\}/g, userPermissions)
    .replace(/\{\{tool_instructions\}\}/g, toolInstructions)
    .replace(/\{\{rules\}\}/g, rulesText)
    .replace(/\{\{custom_instructions\}\}/g, customInstructions)
    .trim();
}
