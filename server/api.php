<?php
// A-teacher CRM — минимальный API: авторизация учителя, синхронизация данных,
// регистрация учеников по ссылке-приглашению и их кабинет (только чтение).
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 дней

$dataDir = dirname(__DIR__) . '/atc_data'; // выше webroot — недоступно по HTTP
if (!is_dir($dataDir)) { mkdir($dataDir, 0755, true); }

try {
  $pdo = new PDO('sqlite:' . $dataDir . '/data.sqlite');
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
  $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT, sid TEXT, created INTEGER)');
  $pdo->exec('CREATE TABLE IF NOT EXISTS student_auth (sid TEXT PRIMARY KEY, pass TEXT)');
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['error' => 'db_unavailable']);
  exit;
}

function out($d) { echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function err(string $m, int $c = 400) { http_response_code($c); out(['error' => $m]); }

function kvGet(PDO $pdo, string $k): ?string {
  $st = $pdo->prepare('SELECT v FROM kv WHERE k = ?');
  $st->execute([$k]);
  $v = $st->fetchColumn();
  return $v === false ? null : $v;
}
function kvSet(PDO $pdo, string $k, string $v): void {
  $pdo->prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, $v]);
}
function newToken(PDO $pdo, string $role, string $sid = ''): string {
  $t = bin2hex(random_bytes(24));
  $pdo->prepare('INSERT INTO sessions (token, role, sid, created) VALUES (?, ?, ?, ?)')->execute([$t, $role, $sid, time()]);
  return $t;
}
function checkToken(PDO $pdo, ?string $token, string $role): ?array {
  if (!$token) return null;
  $st = $pdo->prepare('SELECT role, sid, created FROM sessions WHERE token = ?');
  $st->execute([$token]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row || $row['role'] !== $role) return null;
  if (time() - (int)$row['created'] > TOKEN_TTL) {
    $pdo->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
    return null;
  }
  return $row;
}
function loadData(PDO $pdo): array {
  $raw = kvGet($pdo, 'data');
  $d = $raw ? json_decode($raw, true) : null;
  return is_array($d) ? $d : [];
}
function findByJoin(array $data, string $join): ?array {
  foreach ($data as $id => $s) {
    if (is_array($s) && ($s['join'] ?? null) === $join) return [$id, $s];
  }
  return null;
}

$in = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) $in = [];
$action = $_GET['action'] ?? ($in['action'] ?? '');
$token = $in['token'] ?? '';

switch ($action) {
  case 'ping':
    out(['ok' => true, 'hasTeacher' => kvGet($pdo, 'tpass') !== null]);

  case 'setup': {
    if (kvGet($pdo, 'tpass') !== null) err('already_configured', 403);
    $pass = (string)($in['pass'] ?? '');
    if (mb_strlen($pass) < 4) err('pass_too_short');
    kvSet($pdo, 'tpass', password_hash($pass, PASSWORD_DEFAULT));
    out(['token' => newToken($pdo, 'teacher')]);
  }

  case 'login': {
    $hash = kvGet($pdo, 'tpass');
    $pass = (string)($in['pass'] ?? '');
    if ($hash === null || !password_verify($pass, $hash)) { usleep(400000); err('bad_password', 403); }
    out(['token' => newToken($pdo, 'teacher')]);
  }

  case 'logout': {
    $pdo->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
    out(['ok' => true]);
  }

  case 'get': {
    if (!checkToken($pdo, $token, 'teacher')) err('unauthorized', 401);
    out(['data' => (object)loadData($pdo)]);
  }

  case 'save': {
    if (!checkToken($pdo, $token, 'teacher')) err('unauthorized', 401);
    if (!isset($in['data']) || !is_array($in['data'])) err('bad_data');
    $json = json_encode($in['data'], JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 2_000_000) err('bad_data');
    kvSet($pdo, 'data', $json);
    out(['ok' => true]);
  }

  case 'change_pass': {
    if (!checkToken($pdo, $token, 'teacher')) err('unauthorized', 401);
    $pass = (string)($in['pass'] ?? '');
    if (mb_strlen($pass) < 4) err('pass_too_short');
    kvSet($pdo, 'tpass', password_hash($pass, PASSWORD_DEFAULT));
    out(['ok' => true]);
  }

  case 'student_meta': {
    $join = (string)($in['join'] ?? '');
    $found = findByJoin(loadData($pdo), $join);
    if (!$found) err('not_found', 404);
    [$sid, $s] = $found;
    $st = $pdo->prepare('SELECT 1 FROM student_auth WHERE sid = ?');
    $st->execute([$sid]);
    out(['name' => (string)($s['name'] ?? ''), 'registered' => (bool)$st->fetchColumn()]);
  }

  case 'student_register': {
    $join = (string)($in['join'] ?? '');
    $pass = (string)($in['pass'] ?? '');
    if (mb_strlen($pass) < 4) err('pass_too_short');
    $found = findByJoin(loadData($pdo), $join);
    if (!$found) err('not_found', 404);
    [$sid] = $found;
    $st = $pdo->prepare('SELECT 1 FROM student_auth WHERE sid = ?');
    $st->execute([$sid]);
    if ($st->fetchColumn()) err('already_registered', 403);
    $pdo->prepare('INSERT INTO student_auth (sid, pass) VALUES (?, ?)')
        ->execute([$sid, password_hash($pass, PASSWORD_DEFAULT)]);
    out(['token' => newToken($pdo, 'student', $sid)]);
  }

  case 'student_login': {
    $join = (string)($in['join'] ?? '');
    $pass = (string)($in['pass'] ?? '');
    $found = findByJoin(loadData($pdo), $join);
    if (!$found) err('not_found', 404);
    [$sid] = $found;
    $st = $pdo->prepare('SELECT pass FROM student_auth WHERE sid = ?');
    $st->execute([$sid]);
    $hash = $st->fetchColumn();
    if (!$hash || !password_verify($pass, (string)$hash)) { usleep(400000); err('bad_password', 403); }
    out(['token' => newToken($pdo, 'student', $sid)]);
  }

  case 'student_get': {
    $row = checkToken($pdo, $token, 'student');
    if (!$row) err('unauthorized', 401);
    $data = loadData($pdo);
    $s = $data[$row['sid']] ?? null;
    if (!is_array($s)) err('not_found', 404);
    out(['student' => [
      'name' => $s['name'] ?? '',
      'level' => $s['level'] ?? '',
      'grade' => $s['grade'] ?? '',
      'age' => $s['age'] ?? '',
      'homework' => $s['homework'] ?? '',
      'bookmark' => $s['bookmark'] ?? '',
      'slots' => $s['slots'] ?? [],
      'extra' => $s['extra'] ?? [],
      'balance' => $s['balance'] ?? 0,
      'rate' => $s['rate'] ?? 0,
      'paidTick' => $s['paidTick'] ?? false,
    ]]);
  }

  default:
    err('unknown_action', 404);
}
