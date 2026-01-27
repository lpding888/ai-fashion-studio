#!/usr/bin/env bash
set -euo pipefail

BACKEND_ONLY=0
CLIENT_ONLY=0
CLEANUP_LOCAL_TAR=0

usage() {
  cat <<'USAGE'
AI Fashion Studio - 本地构建并上传部署

用法:
  ./build-and-deploy.sh [--backend-only] [--client-only] [--cleanup-local-tar]

选项:
  --backend-only       仅构建/部署后端
  --client-only        仅构建/部署前端
  --cleanup-local-tar  部署完成后删除本地 ai-fashion-images.tar
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-only|-b)
      BACKEND_ONLY=1
      ;;
    --client-only|-c)
      CLIENT_ONLY=1
      ;;
    --cleanup-local-tar|--cleanup|-x)
      CLEANUP_LOCAL_TAR=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      usage
      exit 1
      ;;
  esac
  shift
 done

if [[ "$BACKEND_ONLY" -eq 1 && "$CLIENT_ONLY" -eq 1 ]]; then
  echo "参数冲突：--backend-only 与 --client-only 不能同时使用"
  exit 1
fi

# ====== 配置区域 ======
SERVER_IP="43.139.187.166"
SERVER_USER="root"
SERVER_PATH="/opt/ai-fashion-studio"
SERVER_STAGING="/root/ai-fashion-studio-upload"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_IMAGE="node:24-bookworm-slim"
NEXT_PUBLIC_API_URL="https://api.aizhao.icu"

REMOTE_HOST="${SERVER_USER}@${SERVER_IP}"

file_size() {
  local path="$1"
  if stat -f%z "$path" >/dev/null 2>&1; then
    stat -f%z "$path"
  else
    stat -c %s "$path"
  fi
}

upload_with_resume() {
  local local_path="$1"
  local remote_host="$2"
  local remote_dir="$3"
  local file_name
  local file_size_local
  local remote_path
  local remote_size_raw
  local remote_size
  local need_resume
  local mode
  local batch_file

  if [[ ! -f "$local_path" ]]; then
    echo "本地文件不存在: $local_path"
    exit 1
  fi

  file_name="$(basename "$local_path")"
  remote_path="${remote_dir}/${file_name}"
  file_size_local="$(file_size "$local_path")"

  remote_size_raw="$(ssh "$remote_host" "stat -c %s \"$remote_path\" 2>/dev/null || stat -f%z \"$remote_path\" 2>/dev/null || echo 0")"
  remote_size="$(echo "$remote_size_raw" | head -n 1 | tr -cd '0-9')"
  if [[ -z "$remote_size" ]]; then
    remote_size=0
  fi

  if [[ "$remote_size" -eq "$file_size_local" && "$file_size_local" -gt 0 ]]; then
    echo "✓ 远端已存在完整文件（跳过上传）: $remote_path"
    return 0
  fi

  if [[ "$remote_size" -gt "$file_size_local" ]]; then
    echo "⚠️ 远端文件比本地更大，先删除后重传: $remote_path"
    ssh "$remote_host" "rm -f \"$remote_path\""
    remote_size=0
  fi

  need_resume=0
  if [[ "$remote_size" -gt 0 && "$remote_size" -lt "$file_size_local" ]]; then
    need_resume=1
  fi

  if [[ "$need_resume" -eq 1 ]]; then
    local mb_remote
    local mb_total
    mb_remote=$(python3 - <<PY
print(round($remote_size / 1024 / 1024, 2))
PY
)
    mb_total=$(python3 - <<PY
print(round($file_size_local / 1024 / 1024, 2))
PY
)
    echo "检测到断点文件，使用 sftp reput 续传：${mb_remote} MB / ${mb_total} MB"
    mode="reput"
  else
    local mb_total
    mb_total=$(python3 - <<PY
print(round($file_size_local / 1024 / 1024, 2))
PY
)
    echo "使用 sftp put 上传：${mb_total} MB"
    mode="put"
  fi

  batch_file="$(mktemp "/tmp/ai-fashion-sftp-XXXXXX.txt")"
  printf 'cd "%s"\n%s "%s" "%s"\n' "$remote_dir" "$mode" "$local_path" "$file_name" > "$batch_file"
  sftp -b "$batch_file" "$remote_host"
  rm -f "$batch_file"

  remote_size_raw="$(ssh "$remote_host" "stat -c %s \"$remote_path\" 2>/dev/null || stat -f%z \"$remote_path\" 2>/dev/null || echo 0")"
  remote_size="$(echo "$remote_size_raw" | head -n 1 | tr -cd '0-9')"
  if [[ -z "$remote_size" ]]; then
    remote_size=0
  fi

  if [[ "$remote_size" -ne "$file_size_local" ]]; then
    echo "✗ 镜像上传不完整：local=$file_size_local remote=$remote_size（$remote_path）"
    exit 1
  fi

  echo "✓ 镜像上传成功（已校验大小一致）"
}

step() {
  echo "[$1] $2"
}

printf "========================================\n"
printf "AI Fashion Studio - 本地构建和部署\n"
printf "========================================\n\n"
printf "参数: BackendOnly=%s, ClientOnly=%s, CleanupLocalTar=%s\n\n" "$BACKEND_ONLY" "$CLIENT_ONLY" "$CLEANUP_LOCAL_TAR"

step "1/7" "检查 Docker..."
if docker version >/dev/null 2>&1; then
  echo "✓ Docker 正在运行"
else
  echo "✗ Docker 未运行，请先启动 Docker"
  exit 1
fi
printf "\n"

if [[ "$CLIENT_ONLY" -eq 0 ]]; then
  step "2/7" "构建后端镜像..."
  (cd "$PROJECT_ROOT/server" && docker buildx build --platform=linux/amd64 --load -t "ai-fashion-server:latest" -f "Dockerfile" --build-arg "NODE_IMAGE=$NODE_IMAGE" ".")
  echo "✓ 后端镜像构建成功"
  printf "\n"
else
  step "2/7" "跳过后端镜像（ClientOnly=true）"
  printf "\n"
fi

if [[ "$CLIENT_ONLY" -eq 0 ]]; then
  step "3/7" "构建后端迁移镜像..."
  (cd "$PROJECT_ROOT/server" && docker buildx build --platform=linux/amd64 --load -t "ai-fashion-server-migrator:latest" --target "migrator" -f "Dockerfile" --build-arg "NODE_IMAGE=$NODE_IMAGE" ".")
  echo "✓ 后端迁移镜像构建成功"
  printf "\n"
else
  step "3/7" "跳过后端迁移镜像（ClientOnly=true）"
  printf "\n"
fi

if [[ "$BACKEND_ONLY" -eq 0 ]]; then
  step "4/7" "构建前端镜像..."
  (cd "$PROJECT_ROOT/client" && docker buildx build --platform=linux/amd64 --load -t "ai-fashion-client:latest" -f "Dockerfile" --build-arg "NODE_IMAGE=$NODE_IMAGE" --build-arg "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" ".")
  echo "✓ 前端镜像构建成功"
  printf "\n"
else
  step "4/7" "跳过前端镜像（BackendOnly=true）"
  printf "\n"
fi

step "5/7" "打包镜像..."
cd "$PROJECT_ROOT"
images_to_save=("ai-fashion-server:latest" "ai-fashion-server-migrator:latest")
if [[ "$CLIENT_ONLY" -eq 1 ]]; then
  images_to_save=("ai-fashion-client:latest")
elif [[ "$BACKEND_ONLY" -eq 0 ]]; then
  images_to_save+=("ai-fashion-client:latest")
fi

docker save -o "ai-fashion-images.tar" "${images_to_save[@]}"
echo "✓ 镜像打包成功"
if [[ -f "$PROJECT_ROOT/ai-fashion-images.tar" ]]; then
  size_mb=$(python3 - <<PY
import os
print(round(os.path.getsize("$PROJECT_ROOT/ai-fashion-images.tar") / 1024 / 1024, 2))
PY
)
  echo "  文件大小: ${size_mb} MB"
fi
printf "\n"

step "6/7" "上传配置文件和镜像到服务器..."
ssh "$REMOTE_HOST" "mkdir -p \"$SERVER_STAGING/deploy\""

scp "$PROJECT_ROOT/deploy/docker-compose.prod.yml" "$REMOTE_HOST:$SERVER_STAGING/deploy/"
scp "$PROJECT_ROOT/deploy/Caddyfile" "$REMOTE_HOST:$SERVER_STAGING/deploy/"
scp "$PROJECT_ROOT/deploy/.env.production.example" "$REMOTE_HOST:$SERVER_STAGING/deploy/"

upload_with_resume "$PROJECT_ROOT/ai-fashion-images.tar" "$REMOTE_HOST" "$SERVER_STAGING"
printf "\n"

step "7/7" "服务器部署..."

restart_targets="server client caddy"
if [[ "$BACKEND_ONLY" -eq 1 ]]; then
  restart_targets="server"
elif [[ "$CLIENT_ONLY" -eq 1 ]]; then
  restart_targets="client caddy"
fi

do_migrate="1"
if [[ "$CLIENT_ONLY" -eq 1 ]]; then
  do_migrate="0"
fi

remote_script="$(mktemp "/tmp/ai-fashion-deploy-XXXXXX.sh")"
cat <<'__REMOTE__' > "$remote_script"
#!/usr/bin/env bash
set -euo pipefail

SERVER_PATH="__SERVER_PATH__"
SERVER_STAGING="__SERVER_STAGING__"
RESTART_TARGETS="__RESTART_TARGETS__"
DO_MIGRATE="__DO_MIGRATE__"

mkdir -p "${SERVER_PATH}/deploy"
cp -f "${SERVER_STAGING}/deploy/docker-compose.prod.yml" "${SERVER_PATH}/deploy/docker-compose.prod.yml"
cp -f "${SERVER_STAGING}/deploy/Caddyfile" "${SERVER_PATH}/deploy/Caddyfile"
cp -f "${SERVER_STAGING}/deploy/.env.production.example" "${SERVER_PATH}/deploy/.env.production.example"
cp -f "${SERVER_STAGING}/ai-fashion-images.tar" "${SERVER_PATH}/ai-fashion-images.tar"
rm -rf "${SERVER_STAGING}"

if [[ ! -f "${SERVER_PATH}/deploy/.env.production" ]]; then
  echo "✗ 缺少 deploy/.env.production，请先在服务器创建该文件（参考 deploy/.env.production.example）"
  exit 1
fi

cd "${SERVER_PATH}"

if docker compose version >/dev/null 2>&1; then
  dc(){ docker compose "$@"; }
else
  dc(){ docker-compose "$@"; }
fi

echo "加载新镜像..."
ROLLBACK_TAG="$(date +%Y%m%d%H%M%S)"
mkdir -p "${SERVER_PATH}/rollback"
ROLLBACK_FILE="${SERVER_PATH}/rollback/rollback-${ROLLBACK_TAG}.txt"
ROLLBACK_TMP="$(mktemp)"

echo "备份当前镜像标签（用于回滚）..."
for img in ai-fashion-server ai-fashion-server-migrator ai-fashion-client; do
  if docker image inspect "${img}:latest" >/dev/null 2>&1; then
    docker tag "${img}:latest" "${img}:rollback-${ROLLBACK_TAG}"
    id="$(docker image inspect "${img}:rollback-${ROLLBACK_TAG}" --format '{{.Id}}' 2>/dev/null || true)"
    echo "${img}:rollback-${ROLLBACK_TAG} ${id}" >> "${ROLLBACK_TMP}"
  else
    echo "${img}:latest (not found)" >> "${ROLLBACK_TMP}"
  fi
done

cat >> "${ROLLBACK_TMP}" <<__RB__

Rollback commands:
  cd ${SERVER_PATH}
  docker tag ai-fashion-server:rollback-${ROLLBACK_TAG} ai-fashion-server:latest
  docker tag ai-fashion-server-migrator:rollback-${ROLLBACK_TAG} ai-fashion-server-migrator:latest
  docker tag ai-fashion-client:rollback-${ROLLBACK_TAG} ai-fashion-client:latest
  docker compose -f deploy/docker-compose.prod.yml up -d --force-recreate ${RESTART_TARGETS}
__RB__

cp -f "${ROLLBACK_TMP}" "${ROLLBACK_FILE}"
rm -f "${ROLLBACK_TMP}"

echo "✓ 回滚备案: ${ROLLBACK_FILE}"

docker load -i "${SERVER_PATH}/ai-fashion-images.tar"

if [[ "${DO_MIGRATE}" = "1" ]]; then
  echo "启动 Postgres..."
  dc -f deploy/docker-compose.prod.yml up -d postgres

  echo "执行数据库迁移..."
  dc -f deploy/docker-compose.prod.yml run --rm migrate
fi

echo "启动/滚动更新服务..."
dc -f deploy/docker-compose.prod.yml up -d --force-recreate ${RESTART_TARGETS}

rm -f "${SERVER_PATH}/ai-fashion-images.tar"

echo ""
echo "部署完成！"
echo "访问地址:"
echo "  前端: https://aizhao.icu"
echo "  后端: https://api.aizhao.icu"
__REMOTE__

sed -e "s|__SERVER_PATH__|$SERVER_PATH|g" \
    -e "s|__SERVER_STAGING__|$SERVER_STAGING|g" \
    -e "s|__RESTART_TARGETS__|$restart_targets|g" \
    -e "s|__DO_MIGRATE__|$do_migrate|g" \
    "$remote_script" > "${remote_script}.rendered"

mv "${remote_script}.rendered" "$remote_script"

scp "$remote_script" "$REMOTE_HOST:$SERVER_STAGING/deploy.sh"
ssh "$REMOTE_HOST" "bash \"$SERVER_STAGING/deploy.sh\""
rm -f "$remote_script"

if [[ "$CLEANUP_LOCAL_TAR" -eq 1 ]]; then
  rm -f "$PROJECT_ROOT/ai-fashion-images.tar"
  echo "✓ 已清理本地镜像包 ai-fashion-images.tar"
else
  echo "提示：本地镜像包保留为 ai-fashion-images.tar（如需自动清理，运行脚本时加 --cleanup-local-tar）"
fi

printf "\n"
printf "========================================\n"
printf "部署完成！\n"
printf "========================================\n\n"
printf "访问地址:\n"
printf "  前端: https://aizhao.icu\n"
printf "  后端: https://api.aizhao.icu\n\n"
printf "查看日志:\n"
printf "  ssh %s@%s 'cd %s && docker compose -f deploy/docker-compose.prod.yml logs -f'\n" "$SERVER_USER" "$SERVER_IP" "$SERVER_PATH"
