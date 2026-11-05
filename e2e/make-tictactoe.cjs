// Make tic-tac-toe from the blank template using only the editor UI, then play it.
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
  await page.waitForSelector('.piece', { timeout: 20000 });

  step('만들기 → 빈 게임');
  await page.click('.mode-tabs .tab >> text=만들기');
  await page.click('.template >> text=빈 게임');
  await page.waitForSelector('.editor');

  step('게임 정보: 이름');
  await page.click('.tabs .tab >> text=게임 정보');
  await page.fill('.field:has-text("게임 이름") input', '틱택토');

  step('컴포넌트: 말 종류 추가, 플레이어마다 X / O');
  await page.click('.tabs .tab >> text=컴포넌트와 배치');
  await page.click('button:has-text("+ 말 종류 추가")');
  await page.check('.type-card label:has-text("플레이어마다 다르게 보이기") input');
  await page.fill('.type-card .field:has-text("1번에게") input', 'X');
  await page.fill('.type-card .field:has-text("2번에게") input', 'O');

  step('보드: 격자');
  await page.click('.tabs .tab >> text=보드');
  await page.selectOption('.field:has-text("보드 모양") select', 'square');
  await page.waitForSelector('.tag-grid');

  step('진행: 넘기기 Action을 "빈 칸에 내 말 놓기"로');
  await page.click('.tabs .tab >> text=진행 (루프)');
  await page.waitForSelector('.react-flow__node');
  await page.click('.react-flow__node[data-id="pass"]');
  await page.selectOption('select[aria-label="Action이 하는 일"]', 'placeOwnPiece');
  await page.selectOption('.recipe .field:has-text("놓을 말 종류") select', 'piece1');
  await page.fill('.node-panel .field:has-text("이름") input', '말 놓기');

  step('진행: Action 하나 더 만들고 끌어서 연결');
  await page.click('button:has-text("+ Action")');
  await page.fill('.node-panel .field:has-text("이름") input', '건너뛰기');
  await page.waitForSelector('.react-flow__node[data-id="action1"]');
  await page.waitForTimeout(500); // let the view re-fit around the new node
  console.log('  warning before connecting:', await page.textContent('.validity.is-warn').catch(() => 'none'));
  const drag = async (from, to) => {
    const a = await page.locator(`.react-flow__node[data-id="${from}"] .react-flow__handle[data-handleid="out"]`).boundingBox();
    const b = await page.locator(`.react-flow__node[data-id="${to}"] .react-flow__handle[data-handleid="in"]`).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  await drag('turn', 'action1');
  await drag('action1', 'after');
  await page.waitForTimeout(300);
  console.log('  edges now:', await page.locator('.react-flow__edge').count(), '/ warning:', await page.textContent('.validity.is-warn').catch(() => 'none'));

  step('진행: "다음 사람" 페이즈에 승리 조건 더하기');
  await page.click('.react-flow__node[data-id="after"]');
  await page.selectOption('select[aria-label="할 일 더하기"]', 'lineWin');
  await page.click('.recipe button:has-text("+ 더하기")');
  await page.selectOption('select[aria-label="할 일 더하기"]', 'fullDraw');
  await page.click('.recipe button:has-text("+ 더하기")');
  // move "다음 플레이어로" (first) to the end
  await page.click('.steps .step >> nth=0 >> button[aria-label="아래로"]');
  await page.click('.steps .step >> nth=1 >> button[aria-label="아래로"]');
  console.log('  steps:', await page.$$eval('.steps .step strong', (s) => s.map((x) => x.textContent)));
  const status = await page.textContent('.validity');
  console.log('  validity:', status);
  await page.screenshot({ path: dir + '/ed-1-loop.png' });

  step('플레이해 보기');
  await page.click('button:has-text("▶ 플레이해 보기")');
  await page.waitForSelector('.board-cells', { timeout: 20000 });
  const cell = async (x, y) => {
    await page.click(`g.zone-target:has(rect[x="${x * 60}"][y="${(2 - y) * 60}"])`);
    await page.waitForTimeout(250);
  };
  await cell(0, 0); await cell(1, 0); await cell(1, 1);
  console.log('  buttons mid-game:', await page.$$eval('.buttons .btn', (b) => b.map((x) => x.textContent)));
  await page.screenshot({ path: dir + '/ed-2-play-mid.png' });

  step('규칙 고치기 → 다시 플레이 (같은 수를 새 규칙으로 재생)');
  await page.click('button:has-text("이 게임 고치기")');
  await page.waitForSelector('.react-flow__node');
  await page.click('.react-flow__node[data-id="after"]');
  await page.fill('.steps .step >> nth=0 >> input', '3');
  await page.click('button:has-text("▶ 플레이해 보기")');
  await page.waitForSelector('.board-cells', { timeout: 20000 });
  await page.waitForTimeout(500);
  console.log('  replay note:', await page.textContent('.play-toolbar'));
  await cell(2, 0); await cell(2, 2);
  await page.waitForSelector('.result-title', { timeout: 10000 });
  console.log('  result:', await page.textContent('.result'));
  await page.screenshot({ path: dir + '/ed-3-play-won.png' });

  step('새로고침 후에도 남아 있는지');
  await page.reload();
  await page.waitForSelector('.mode-tabs');
  await page.click('.mode-tabs .tab >> text=만들기');
  console.log('  my games:', await page.$$eval('.project-row strong', (s) => s.map((x) => x.textContent)));

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
