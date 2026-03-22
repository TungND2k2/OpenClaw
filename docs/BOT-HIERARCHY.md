# Bot Hierarchy — Phân cấp bot theo tổ chức

> Status: **PLANNED** — kế hoạch dài hạn

## Mô hình

```
Bot Chủ tịch (toàn quyền)
  │
  ├── Bot Giám đốc Sản xuất
  │     ├── Bot Phòng May
  │     ├── Bot Phòng Thêu
  │     └── Bot Phòng Nguyên liệu
  │
  ├── Bot Giám đốc Kinh doanh
  │     ├── Bot Phòng Sales
  │     └── Bot Phòng CSKH
  │
  └── Bot Giám đốc Tài chính
        ├── Bot Phòng Kế toán
        └── Bot Phòng Thu mua
```

## Quyền truy cập data

```
Bot Phòng May → chỉ thấy data của Phòng May
Bot Phòng Sales → chỉ thấy data của Phòng Sales
Bot GĐ Sản xuất → thấy data: Phòng May + Phòng Thêu + Phòng Nguyên liệu
Bot GĐ Kinh doanh → thấy data: Phòng Sales + Phòng CSKH
Bot Chủ tịch → thấy TẤT CẢ data
```

## DB Schema

```sql
-- Thêm parent_tenant_id vào tenants
ALTER TABLE tenants ADD COLUMN parent_tenant_id TEXT REFERENCES tenants(id);

-- Hierarchy:
-- Chủ tịch: parent_tenant_id = NULL (root)
-- GĐ Sản xuất: parent_tenant_id = chủ tịch.id
-- Phòng May: parent_tenant_id = gđ_sản_xuất.id
```

## Query logic

```
Bot Phòng May query data:
  WHERE tenant_id = 'phong_may'

Bot GĐ Sản xuất query data:
  WHERE tenant_id IN (SELECT id FROM tenants WHERE parent_tenant_id = 'gd_san_xuat' OR id = 'gd_san_xuat')

Bot Chủ tịch query data:
  WHERE tenant_id IN (SELECT id FROM tenant_tree('chu_tich'))
  → recursive CTE lấy tất cả descendants
```

## Cross-bot communication

```
Phòng Sales tạo đơn hàng → cần Phòng Sản xuất xác nhận
  → Bot Sales gửi message cho Bot Sản xuất (qua internal queue)
  → Bot Sản xuất nhận → hỏi manager Sản xuất duyệt
  → Duyệt → cập nhật trạng thái → Bot Sales nhận kết quả
```

## TODO

- [ ] `parent_tenant_id` trên tenants table
- [ ] Recursive tenant tree query
- [ ] Cross-tenant data access theo hierarchy
- [ ] Inter-bot messaging (internal queue)
- [ ] Super Admin tạo hierarchy qua chat
