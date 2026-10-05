#!/usr/bin/env bash
# A MySQL server (and optionally phpMyAdmin) for development on THIS computer.
# Everything lives outside the repo, in ~/.swasthtrack-mysql, and listens on 127.0.0.1 only.
#
#   npm run db:local -- init      first time: create the data folder, the database and the users
#   npm run db:local -- start     start MySQL (data is kept between runs)
#   npm run db:local -- stop      stop MySQL (and phpMyAdmin)
#   npm run db:local -- status
#   npm run db:local -- sql       open a mysql shell as the admin user
#   npm run db:local -- pma       start phpMyAdmin at http://127.0.0.1:8794 (see docs/database.md)
#
# Passwords are generated here and written only to files in ~/.swasthtrack-mysql (mode 600):
#   app.env    DATABASE_URL / TEST_DATABASE_URL for the app user (copy DATABASE_URL into .env.local)
#   admin.cnf  the root login used by `sql` and `stop`
set -euo pipefail

HOME_DIR="${SWASTHTRACK_MYSQL_HOME:-$HOME/.swasthtrack-mysql}"
PORT="${SWASTHTRACK_MYSQL_PORT:-3318}"
PMA_PORT="${SWASTHTRACK_PMA_PORT:-8794}"
DB_NAME="swasthtrack"
DB_USER="swasthtrack"

DATA="$HOME_DIR/data"
RUN="$HOME_DIR/run"
LOG="$HOME_DIR/log"
CNF="$HOME_DIR/my.cnf"
SOCK="$RUN/mysql.sock"
ADMIN="$HOME_DIR/admin.cnf"
APP_ENV="$HOME_DIR/app.env"
PMA="$HOME_DIR/phpmyadmin"
PMA_PID="$RUN/phpmyadmin.pid"

die() { echo "error: $*" >&2; exit 1; }

find_basedir() {
  local candidate
  for candidate in "${MYSQL_BASEDIR:-}" /usr/local/mysql /opt/homebrew/opt/mysql /usr/local/opt/mysql /opt/homebrew/opt/mysql@8.4 /opt/homebrew/opt/mysql@8.0; do
    if [ -n "$candidate" ] && [ -x "$candidate/bin/mysqld" ]; then echo "$candidate"; return; fi
  done
  if command -v mysqld >/dev/null 2>&1; then
    dirname "$(dirname "$(command -v mysqld)")"
    return
  fi
  die "mysqld was not found. Install MySQL (for example: brew install mysql) or set MYSQL_BASEDIR=/path/to/mysql."
}

BASE="$(find_basedir)"

is_running() {
  [ -S "$SOCK" ] && "$BASE/bin/mysqladmin" --no-defaults --socket="$SOCK" ping >/dev/null 2>&1
}

write_cnf() {
  cat > "$CNF" <<EOF
[mysqld]
basedir=$BASE
datadir=$DATA
port=$PORT
bind-address=127.0.0.1
socket=$SOCK
pid-file=$RUN/mysql.pid
log-error=$LOG/mysqld.log
mysqlx=OFF
skip-name-resolve
character-set-server=utf8mb4
innodb_buffer_pool_size=128M
max_connections=60
EOF
}

wait_until_up() {
  local i
  for i in $(seq 1 60); do
    if is_running; then return 0; fi
    sleep 1
  done
  die "MySQL did not start within 60 seconds. See $LOG/mysqld.log"
}

cmd_start() {
  [ -d "$DATA/mysql" ] || die "no database yet. Run: npm run db:local -- init"
  if is_running; then echo "MySQL is already running on 127.0.0.1:$PORT"; return; fi
  rm -f "$SOCK" "$SOCK.lock"
  nohup "$BASE/bin/mysqld" --defaults-file="$CNF" >> "$LOG/mysqld.log" 2>&1 < /dev/null &
  wait_until_up
  echo "MySQL is running on 127.0.0.1:$PORT (data in $DATA)"
}

cmd_stop() {
  if [ -f "$PMA_PID" ] && kill -0 "$(cat "$PMA_PID")" 2>/dev/null; then
    kill "$(cat "$PMA_PID")" && echo "phpMyAdmin stopped"
  fi
  rm -f "$PMA_PID"
  if is_running; then
    "$BASE/bin/mysqladmin" --defaults-file="$ADMIN" shutdown
    echo "MySQL stopped (the data is kept)"
  else
    echo "MySQL is not running"
  fi
}

cmd_status() {
  if is_running; then echo "MySQL: running on 127.0.0.1:$PORT"; else echo "MySQL: stopped"; fi
  if [ -f "$PMA_PID" ] && kill -0 "$(cat "$PMA_PID")" 2>/dev/null; then
    echo "phpMyAdmin: running at http://127.0.0.1:$PMA_PORT"
  else
    echo "phpMyAdmin: stopped"
  fi
}

cmd_init() {
  [ ! -d "$DATA/mysql" ] || die "already initialised ($DATA). Use start; delete $HOME_DIR to begin again (this removes all data)."
  (umask 077; mkdir -p "$DATA" "$RUN" "$LOG")
  chmod 700 "$HOME_DIR"
  write_cnf
  echo "Creating the data folder (about 15 seconds) ..."
  "$BASE/bin/mysqld" --defaults-file="$CNF" --initialize-insecure >> "$LOG/initialize.log" 2>&1 \
    || die "initialisation failed, see $LOG/initialize.log"
  cmd_start

  local root_pw app_pw
  root_pw="$(openssl rand -hex 16)"
  app_pw="$(openssl rand -hex 16)"
  # Passwords go in through stdin so they never appear in the process list.
  "$BASE/bin/mysql" --no-defaults --socket="$SOCK" -uroot <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '$root_pw';
CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS ${DB_NAME}_test CHARACTER SET utf8mb4;
CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$app_pw';
CREATE USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$app_pw';
GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'localhost';
GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'127.0.0.1';
GRANT ALL ON ${DB_NAME}_test.* TO '$DB_USER'@'localhost';
GRANT ALL ON ${DB_NAME}_test.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
  (
    umask 077
    printf '[client]\nuser=root\npassword=%s\nsocket=%s\n' "$root_pw" "$SOCK" > "$ADMIN"
    printf 'DATABASE_URL=mysql://%s:%s@127.0.0.1:%s/%s\nTEST_DATABASE_URL=mysql://%s:%s@127.0.0.1:%s/%s_test\n' \
      "$DB_USER" "$app_pw" "$PORT" "$DB_NAME" "$DB_USER" "$app_pw" "$PORT" "$DB_NAME" > "$APP_ENV"
  )
  echo
  echo "Done. MySQL 127.0.0.1:$PORT, databases '$DB_NAME' and '${DB_NAME}_test'."
  echo "The app login is in $APP_ENV (copy its DATABASE_URL line into .env.local)."
  echo "The admin login is in $ADMIN. Both files are readable by you only."
}

cmd_sql() {
  is_running || die "MySQL is not running. Run: npm run db:local -- start"
  exec "$BASE/bin/mysql" --defaults-file="$ADMIN"
}

php_bin() {
  if command -v php >/dev/null 2>&1; then command -v php; return; fi
  local herd="$HOME/Library/Application Support/Herd/bin/php"
  if [ -x "$herd" ]; then echo "$herd"; return; fi
  die "PHP was not found (phpMyAdmin needs it). Install PHP, or Laravel Herd."
}

cmd_pma() {
  [ -f "$PMA/index.php" ] || die "phpMyAdmin is not installed. Download the 'english' zip from https://www.phpmyadmin.net/downloads/ and unzip its contents into $PMA"
  is_running || cmd_start
  mkdir -p "$PMA/tmp"
  if [ ! -f "$PMA/config.inc.php" ]; then
    (
      umask 077
      cat > "$PMA/config.inc.php" <<EOF
<?php
// Written by scripts/db/local-mysql.sh. Sign in with the app user from $APP_ENV.
\$cfg['blowfish_secret'] = '$(openssl rand -hex 24)';
\$cfg['Servers'][1]['auth_type'] = 'cookie';
\$cfg['Servers'][1]['host'] = 'localhost';
\$cfg['Servers'][1]['socket'] = '$SOCK';
\$cfg['Servers'][1]['AllowNoPassword'] = false;
\$cfg['AllowArbitraryServer'] = false;
\$cfg['LoginCookieValidity'] = 28800;
\$cfg['TempDir'] = '$PMA/tmp';
\$cfg['VersionCheck'] = false;
\$cfg['SendErrorReports'] = 'never';
EOF
    )
  fi
  if [ -f "$PMA_PID" ] && kill -0 "$(cat "$PMA_PID")" 2>/dev/null; then
    echo "phpMyAdmin is already running at http://127.0.0.1:$PMA_PORT"
    return
  fi
  # No stdin / stdout / stderr left attached, so the terminal (or npm's pipe) is not held open.
  nohup "$(php_bin)" -S "127.0.0.1:$PMA_PORT" -t "$PMA" >> "$LOG/phpmyadmin.log" 2>&1 < /dev/null &
  echo $! > "$PMA_PID"
  sleep 1
  echo "phpMyAdmin: http://127.0.0.1:$PMA_PORT   (user: $DB_USER, password: see $APP_ENV)"
}

case "${1:-}" in
  init) cmd_init ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  sql) cmd_sql ;;
  pma) cmd_pma ;;
  *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
