const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node tests/browser.cjs <sample_2-original-path>');
  const executablePath = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    const upload = async () => {
      await page.locator('#fileInput').setInputFiles(file);
      await page.waitForFunction(() => state.imageData !== null);
    };
    await upload();
    await page.click('#analyzeBtn');
    await page.waitForFunction(() => state.autoResult !== null);
    assert.equal(await page.locator('#resultCode').textContent(), '26265210');
    assert.equal(await page.locator('#copyCodeBtn').isDisabled(), true);
    assert.ok(await page.evaluate(() => state.imageData.data.some(value => value < 150)), 'source canvas must contain document pixels');
    const imageHash = await page.evaluate(() => state.imageData.data.reduce((sum, v) => (sum + v) >>> 0, 0));
    await page.click('#showSubzonePanelToggle');
    const before = await page.locator('#resultCode').textContent();
    await page.locator('.subzone-cell').nth(14).click();
    assert.equal(await page.locator('#resultCode').textContent(), before, 'inspection must not edit the code');
    assert.equal(await page.evaluate(() => state.manualMarks.length), 0);
    await page.click('#confirmSubzoneBtn');
    assert.equal(await page.evaluate(() => state.manualMarks.length), 1);
    assert.equal(await page.evaluate(() => state.manualMarks[0].cx), 646);
    assert.equal(await page.locator('#copyCodeBtn').isDisabled(), false);
    await page.click('#clearMarksBtn');
    assert.equal(await page.evaluate(() => state.manualMarks.length), 0);
    await fs.mkdir('.local-tests', { recursive: true });
    await page.screenshot({ path: '.local-tests/desktop.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `layout at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.local-tests/mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.evaluate(() => state.imageData.data.reduce((sum, v) => (sum + v) >>> 0, 0)), imageHash);
    await page.click('#autoDetectToggle');
    assert.equal(await page.evaluate(() => state.autoResult), null);
    await page.locator('#regW').fill('-1');
    await page.click('#analyzeBtn');
    assert.match(await page.locator('#analyzeProgress').textContent(), /영역/);
    assert.equal(await page.evaluate(() => state.autoResult), null);
    await page.click('#autoDetectToggle');
    await page.evaluate(() => { analyze(); addManualMark(249, 79); });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => state.autoResult), null);
    assert.equal(await page.evaluate(() => state.manualMarks.length), 1);
    await page.evaluate(() => { analyze(); resetAll(); });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => state.imageData), null);
    assert.equal(await page.evaluate(() => state.autoResult), null);
    await upload();
    await page.evaluate(() => { loadImage(new File(['bad'], 'bad.png', {type:'image/png'})); });
    await page.waitForFunction(() => document.getElementById('analyzeProgress').textContent.includes('읽을 수'));
    assert.equal(await page.evaluate(() => state.imageData), null);
    assert.equal(await page.locator('#copyCodeBtn').isDisabled(), true);
    await page.locator('#cameraInput').setInputFiles(path.resolve('sample_9(출력본).jpg'));
    await page.waitForFunction(() => state.imageData !== null);
    await page.click('#analyzeBtn');
    await page.waitForFunction(() => state.autoResult !== null);
    assert.equal(await page.locator('#resultCode').textContent(), '26174411');
    assert.match(await page.evaluate(() => state.autoResult.mode), /QR/);
    assert.equal(await page.evaluate(() => state.region.x), await page.evaluate(() => state.autoResult.region.x));
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: real worker, upload, inspection, correction, cancellation, invalid input, desktop/mobile layout.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
