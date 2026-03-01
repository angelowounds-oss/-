/**
 * Gmail 스마트 이메일 자동 삭제 스크립트
 * Google Apps Script (script.google.com) 에서 실행하세요.
 *
 * [사용 방법]
 * 1. https://script.google.com 접속
 * 2. 새 프로젝트 만들기
 * 3. 이 코드 전체를 붙여넣기 후 저장 (Ctrl+S)
 * 4. 상단 함수 선택란에서 'smartCleanup' 선택 후 실행(▶) 버튼 클릭
 * 5. 최초 실행 시 Google 계정 권한 허용
 * 6. 실행 로그(보기 > 로그)에서 결과 확인
 *
 * [안전 장치]
 * - 중요 표시(★)된 메일은 절대 삭제하지 않음
 * - 영구 삭제가 아닌 휴지통 이동 (30일간 복구 가능)
 * - 실행 전 카테고리별 삭제 수량을 로그에 출력
 */

// ───────────────────────────────────────────────
// 삭제 기준 설정 (필요에 따라 수정 가능)
// ───────────────────────────────────────────────
const CLEANUP_CRITERIA = [
  {
    label: '프로모션/광고',
    query: 'category:promotions -is:starred',
  },
  {
    label: '소셜 알림 (SNS, 앱)',
    query: 'category:social -is:starred',
  },
  {
    label: '6개월 이상 미열람',
    query: 'is:unread older_than:6m -is:starred',
  },
  {
    label: '자동발송 메일 (no-reply)',
    query: 'from:(no-reply OR noreply OR donotreply) older_than:3m -is:starred',
  },
  {
    label: '마케팅 메일 (수신거부 포함)',
    query: 'unsubscribe older_than:3m -is:starred',
  },
];

// 한 번에 처리할 최대 스레드 수 (Apps Script 실행 시간 6분 제한 고려)
const BATCH_SIZE = 100;

// ───────────────────────────────────────────────
// 메인 함수: 스마트 정리 실행
// ───────────────────────────────────────────────
function smartCleanup() {
  Logger.log('====== Gmail 스마트 정리 시작 ======');
  Logger.log('실행 시각: ' + new Date().toLocaleString('ko-KR'));
  Logger.log('');

  // 삭제 대상 스레드 ID를 Set으로 관리 (중복 제거)
  const threadIdSet = new Set();
  const categoryReport = [];

  // 각 조건별 검색
  for (const criterion of CLEANUP_CRITERIA) {
    const found = searchThreads(criterion.query);
    const before = threadIdSet.size;

    found.forEach(thread => threadIdSet.add(thread.getId()));

    const added = threadIdSet.size - before;
    categoryReport.push({ label: criterion.label, count: added });
    Logger.log('[' + criterion.label + '] ' + added + '개 발견');
  }

  Logger.log('');
  Logger.log('──────────────────────────────');
  Logger.log('총 삭제 대상: ' + threadIdSet.size + '개 스레드');
  Logger.log('──────────────────────────────');

  if (threadIdSet.size === 0) {
    Logger.log('삭제할 메일이 없습니다. 완료!');
    return;
  }

  // 스레드 ID 배열로 변환 후 배치 삭제
  const threadIds = Array.from(threadIdSet);
  let deletedCount = 0;

  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);

    batch.forEach(id => {
      try {
        const thread = GmailApp.getThreadById(id);
        if (thread) {
          thread.moveToTrash();
          deletedCount++;
        }
      } catch (e) {
        Logger.log('오류 (스레드 ID: ' + id + '): ' + e.message);
      }
    });

    Logger.log(deletedCount + '/' + threadIds.length + '개 처리 중...');

    // Apps Script 실행 시간 제한 방지: 5분 30초 초과 시 중단
    if (isTimeRunningOut()) {
      Logger.log('⚠ 실행 시간 한계에 근접. 이번 실행은 여기서 중단합니다.');
      Logger.log('  → smartCleanup()을 다시 실행하면 나머지를 처리합니다.');
      break;
    }
  }

  Logger.log('');
  Logger.log('====== 정리 완료 ======');
  Logger.log('총 ' + deletedCount + '개 스레드를 휴지통으로 이동했습니다.');
  Logger.log('Gmail > 휴지통에서 확인하거나 복구할 수 있습니다 (30일 보관).');
}

// ───────────────────────────────────────────────
// 보조 함수: Gmail 검색 (페이지네이션 처리)
// ───────────────────────────────────────────────
function searchThreads(query) {
  const threads = [];
  let start = 0;

  while (true) {
    const batch = GmailApp.search(query, start, 500);
    if (batch.length === 0) break;

    threads.push(...batch);
    start += batch.length;

    // 너무 많은 경우 5000개로 제한 (안전)
    if (threads.length >= 5000) {
      Logger.log('  ※ 검색 결과 5000개 초과로 일부만 처리합니다.');
      break;
    }

    // 더 이상 결과 없으면 종료
    if (batch.length < 500) break;

    // 실행 시간 체크
    if (isTimeRunningOut()) break;
  }

  return threads;
}

// ───────────────────────────────────────────────
// 보조 함수: 실행 시간 체크 (5분 30초 기준)
// ───────────────────────────────────────────────
const START_TIME = new Date();

function isTimeRunningOut() {
  const elapsed = (new Date() - START_TIME) / 1000; // 초 단위
  return elapsed > 330; // 5분 30초
}

// ───────────────────────────────────────────────
// 선택 기능: 매주 자동 실행 트리거 등록
// (이 함수를 한 번만 실행하면 매주 자동으로 smartCleanup이 실행됩니다)
// ───────────────────────────────────────────────
function createWeeklyTrigger() {
  // 기존 트리거 제거 (중복 방지)
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'smartCleanup') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 매주 월요일 오전 9시에 실행
  ScriptApp.newTrigger('smartCleanup')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  Logger.log('✓ 매주 월요일 오전 9시에 자동 실행 트리거가 등록되었습니다.');
}

// ───────────────────────────────────────────────
// 선택 기능: 등록된 트리거 전체 삭제
// ───────────────────────────────────────────────
function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  Logger.log('모든 트리거가 삭제되었습니다.');
}
