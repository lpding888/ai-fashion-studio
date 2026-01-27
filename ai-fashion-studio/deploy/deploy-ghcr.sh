#!/usr/bin/env bash
set -euo pipefail

IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/lpding888}"
SERVER_PATH="${SERVER_PATH:-/opt/ai-fashion-studio}"
ENV_FILE="${ENV_FILE:-$SERVER_PATH/deploy/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$SERVER_PATH/deploy/docker-compose.prod.yml}"
RESTART_TARGETS="${RESTART_TARGETS:-server client caddy}"
DO_MIGRATE="${DO_MIGRATE:-1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ 缺少 deploy/.env.production，请先在服务器创建该文件（参考 deploy/.env.production.example）"
  exit 1
fi

cd "$SERVER_PATH"

if docker compose version >/dev/null 2>&1; then
  dc(){ docker compose "$@"; }
else
  dc(){ docker-compose "$@"; }
fi

echo "备份当前镜像标签（用于回滚）..."
ROLLBACK_TAG="$(date +%Y%m%d%H%M%S)"
mkdir -p "$SERVER_PATH/rollback"
ROLLBACK_FILE="$SERVER_PATH/rollback/rollback-${ROLLBACK_TAG}.txt"
ROLLBACK_TMP="$(mktemp)"

for img in ai-fashion-server ai-fashion-server-migrator ai-fashion-client; do
  if docker image inspect "${img}:latest" >/dev/null 2>&1; then
    docker tag "${img}:latest" "${img}:rollback-${ROLLBACK_TAG}"
    id="$(docker image inspect "${img}:rollback-${ROLLBACK_TAG}" --format '{{.Id}}' 2>/dev/null || true)"
    echo "${img}:rollback-${ROLLBACK_TAG} ${id}" >> "$ROLLBACK_TMP"
  else
    echo "${img}:latest (not found)" >> "$ROLLBACK_TMP"
  fi
done

cat >> "$ROLLBACK_TMP" <<EOF

Rollback commands:
  cd $SERVER_PATH
  docker tag ai-fashion-server:rollback-${ROLLBACK_TAG} ai-fashion-server:latest
  docker tag ai-fashion-server-migrator:rollback-${ROLLBACK_TAG} ai-fashion-server-migrator:latest
  docker tag ai-fashion-client:rollback-${ROLLBACK_TAG} ai-fashion-client:latest
  docker compose -f deploy/docker-compose.prod.yml up -d --force-recreate ${RESTART_TARGETS}
EOF

cp -f "$ROLLBACK_TMP" "$ROLLBACK_FILE"
rm -f "$ROLLBACK_TMP"

echo "✓ 回滚备案: $ROLLBACK_FILE"

echo "拉取 GHCR 镜像..."
for name in server server-migrator client; do
  remote="${IMAGE_PREFIX}/ai-fashion-${name}:latest"
  local="ai-fashion-${name}:latest"
  docker pull "$remote"
  docker tag "$remote" "$local"
done

if [[ "$DO_MIGRATE" = "1" ]]; then
  echo "启动 Postgres..."
  dc -f "$COMPOSE_FILE" up -d postgres

  echo "执行数据库迁移..."
  dc -f "$COMPOSE_FILE" run --rm migrate
fi

echo "启动/滚动更新服务..."
dc -f "$COMPOSE_FILE" up -d --force-recreate ${RESTART_TARGETS}

echo ""
echo "部署完成！"
echo "访问地址:"
echo "  前端: https://aizhao.icu"
echo "  后端: https://api.aizhao.icu"
