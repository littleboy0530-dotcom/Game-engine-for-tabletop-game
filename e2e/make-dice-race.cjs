// Make a dice race from the blank template using only the editor UI, then play it to the end.
const { chromium } = require('playwright');
const dir = process.argv[2];
const step = (s) => console.log('·', s);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('.mode-tabs', { timeout: 20000 });

  step('만들기 → 빈 게임');
  await page.click('.mode-tabs .tab >> text=만들기');
  await page.click('.template >> text=빈 게임');
  await page.click('.tabs .tab >> text=게임 정보');
  await page.fill('.field:has-text("게임 이름") input', '주사위 경주');

  step('보드: 트랙 (기본 10칸, 끝이 이어지지 않음), 주사위 놓을 존');
  await page.click('.tabs .tab >> text=보드');
  await page.selectOption('.field:has-text("보드 모양") select', 'track');
  await page.fill('.zone-row input[aria-label="존 id"]', 'dice');
  await page.fill('.zone-row input[aria-label="존 이름"]', '주사위');

  step('컴포넌트: 말 하나, 주사위 하나, 처음 배치');
  await page.click('.tabs .tab >> text=컴포넌트와 배치');
  await page.click('button:has-text("+ 말 종류 추가")');
  await page.fill('.type-card .field:has-text("보이는 글자") input', '●');
  await page.click('button:has-text("+ 주사위 종류 추가")');
  // pawn for each player at space 0, the die in the dice zone
  for (const owner of ['p1', 'p2']) {
    await page.click('button:has-text("+ 배치 추가")');
    const row = page.locator('.setup-row').last();
    await row.locator('select[aria-label="종류"]').selectOption('piece1');
    await row.locator('select[aria-label="놓을 곳"]').selectOption('__at');
    await row.locator('input[aria-label="칸"]').fill('0');
    await row.locator('select[aria-label="주인"]').selectOption(owner);
  }
  await page.click('button:has-text("+ 배치 추가")');
  const dieRow = page.locator('.setup-row').last();
  await dieRow.locator('select[aria-label="종류"]').selectOption('die1');
  await dieRow.locator('select[aria-label="놓을 곳"]').selectOption('dice');

  step('진행: 넘기기 → 주사위 굴려서 앞으로, 다음 사람 → 트랙 끝에 닿으면 승리');
  await page.click('.tabs .tab >> text=진행 (루프)');
  await page.click('.react-flow__node[data-id="pass"]');
  await page.selectOption('select[aria-label="Action이 하는 일"]', 'rollAndMove');
  await page.selectOption('.recipe .field:has-text("굴릴 주사위") select', 'die1');
  await page.selectOption('.recipe .field:has-text("움직일 내 말 종류") select', 'piece1');
  await page.fill('.node-panel .field:has-text("이름") input', '주사위 굴리기');
  await page.click('.react-flow__node[data-id="after"]');
  await page.selectOption('select[aria-label="할 일 더하기"]', 'reachEnd');
  await page.click('.recipe button:has-text("+ 더하기")');
  await page.selectOption('.steps .step >> nth=1 >> select', 'piece1');
  await page.click('.steps .step >> nth=0 >> button[aria-label="아래로"]');
  console.log('  steps:', await page.$$eval('.steps .step strong', (s) => s.map((x) => x.textContent)));
  console.log('  validity:', await page.textContent('.validity'));

  step('플레이: 끝날 때까지 굴리기');
  await page.click('button:has-text("▶ 플레이해 보기")');
  await page.waitForSelector('.ring', { timeout: 20000 });
  for (let i = 0; i < 60; i++) {
    if (await page.$('.result-title')) break;
    await page.click('.buttons .btn >> text=주사위 굴리기');
    await page.waitForTimeout(120);
  }
  console.log('  result:', await page.textContent('.result').catch(() => 'not finished'));
  console.log('  log:', (await page.$$eval('.log li', (l) => l.map((x) => x.textContent))).slice(0, 3));
  await page.screenshot({ path: dir + '/ed-4-race.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
