## 备份与恢复 Runbook（Postgres / docker compose）

> 目标：至少能做到“可手工备份、可手工恢复、可演练”。

## 现状与假设
- DB 由 `ai-fashion-studio/docker-compose.yml` 启动，容器名：`ai_fashion_db`
- 本地单机 MVP：先以手工脚本为准

## 备份（dump）
1) 确保容器运行：`docker ps`
2) 导出（示例）：
   - `docker exec -t ai_fashion_db pg_dump -U admin -d fashion_studio -F c -f /tmp/fashion_studio.dump`
3) 拷出到本机（示例）：
   - `docker cp ai_fashion_db:/tmp/fashion_studio.dump ./fashion_studio.dump`

## 恢复（restore）
1) 停止写入（关闭服务 / 暂停生成）
2) 将备份拷入容器（示例）：
   - `docker cp ./fashion_studio.dump ai_fashion_db:/tmp/fashion_studio.dump`
3) 恢复（示例）：
   - `docker exec -t ai_fashion_db pg_restore -U admin -d fashion_studio --clean --if-exists /tmp/fashion_studio.dump`
4) P0 冒烟验证（见 `docs/runbooks/release.md`）

## 演练记录（建议）
- 频率：每 2~4 周至少一次（或每次重大 schema 变更后）
- 记录：日期、耗时、遇到的问题、改进项

