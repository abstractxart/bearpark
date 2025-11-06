const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width:1280, height:900});

  const urls = [
    { url: 'http://localhost:8000/main.html', name: 'main' },
    { url: 'http://localhost:8000/frontend/main.html', name: 'frontend-main' }
  ];

  if (!fs.existsSync('./screenshots')) fs.mkdirSync('./screenshots');

  for (const u of urls) {
    console.log('Opening', u.url);
    try {
      await page.goto(u.url, { waitUntil: 'networkidle2', timeout: 60000 });
      // Wait a short moment for any CSS fonts/images to settle
      await page.waitForTimeout(1200);
      const path = `./screenshots/${u.name}.png`;
      await page.screenshot({ path, fullPage: true });
      console.log('Saved', path);
    } catch (err) {
      console.error('Failed to capture', u.url, err.message);
    }
  }

  await browser.close();
})();
